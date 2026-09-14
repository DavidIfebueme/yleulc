#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <pthread.h>
#include <dlfcn.h>
#include <X11/Xlib.h>
#include <X11/Xatom.h>
#include <X11/Xutil.h>
#include <X11/extensions/XShm.h>
#define YLEULC_OVERLAY_ENV "YLEULC_OVERLAY_CLASS"
#define YLEULC_LOG_ENV "YLEULC_REWRITER_LOG"
#define YLEULC_DEFAULT_CLASS "yleulc-overlay"
#define YLEULC_MIN_CAPTURE_WIDTH 800
#define YLEULC_MIN_CAPTURE_HEIGHT 400
#define YLEULC_MIN_OVERLAY_WIDTH 20
#define YLEULC_MIN_OVERLAY_HEIGHT 20
#define YLEULC_FIFO_CAP 16
#define YLEULC_LOG_THROTTLE_SEC 5
#define YLEULC_TREE_DEPTH_MAX 8
typedef struct {
  int x;
  int y;
  unsigned int width;
  unsigned int height;
} YleulcRect;
typedef struct {
  Window window;
  int x;
  int y;
  unsigned int width;
  unsigned int height;
  int present;
} YleulcOverlay;
static pthread_mutex_t yleulcLogLock = PTHREAD_MUTEX_INITIALIZER;
static pthread_mutex_t yleulcDisplayLock = PTHREAD_MUTEX_INITIALIZER;
static pthread_mutex_t yleulcFifoLock = PTHREAD_MUTEX_INITIALIZER;
static pthread_mutex_t yleulcRewriteLock = PTHREAD_MUTEX_INITIALIZER;
static Display *yleulcDisplay = NULL;
static Pixmap yleulcPixmapFifo[YLEULC_FIFO_CAP];
static unsigned int yleulcPixmapCount = 0;
static unsigned int yleulcPixmapNext = 0;
static XImage *yleulcShmFrame = NULL;
static int yleulcHookFired = 0;
static unsigned long yleulcFrameTotal = 0;
static time_t yleulcLastRewriteLog = 0;
static int yleulcPrevValid = 0;
static int yleulcPrevX = 0;
static int yleulcPrevY = 0;
static unsigned int yleulcPrevWidth = 0;
static unsigned int yleulcPrevHeight = 0;
static void yleulcLog(const char *fmt, ...) {
  const char *path = getenv(YLEULC_LOG_ENV);
  if (!path) {
    return;
  }
  pthread_mutex_lock(&yleulcLogLock);
  FILE *out = fopen(path, "a");
  if (out) {
    va_list args;
    va_start(args, fmt);
    vfprintf(out, fmt, args);
    va_end(args);
    fputc('\n', out);
    fclose(out);
  }
  pthread_mutex_unlock(&yleulcLogLock);
}
static Display *yleulcAcquireDisplay(void) {
  if (yleulcDisplay) {
    return yleulcDisplay;
  }
  pthread_mutex_lock(&yleulcDisplayLock);
  if (!yleulcDisplay) {
    yleulcDisplay = XOpenDisplay(NULL);
  }
  pthread_mutex_unlock(&yleulcDisplayLock);
  return yleulcDisplay;
}
static int yleulcIsRoot(Display *dpy, Drawable target) {
  if (target == DefaultRootWindow(dpy)) {
    return 1;
  }
  int screens = ScreenCount(dpy);
  for (int i = 0; i < screens; i++) {
    if (target == RootWindow(dpy, i)) {
      return 1;
    }
  }
  return 0;
}
static int yleulcRootGeometry(Display *dpy, Window w, int *outX, int *outY, unsigned int *outW, unsigned int *outH) {
  Window rootw;
  int rx;
  int ry;
  unsigned int bw;
  unsigned int depth;
  Window child;
  if (!XGetGeometry(dpy, w, &rootw, &rx, &ry, outW, outH, &bw, &depth)) {
    return 0;
  }
  if (!XTranslateCoordinates(dpy, w, rootw, 0, 0, outX, outY, &child)) {
    return 0;
  }
  return 1;
}
static int yleulcCaptureLargeEnough(XImage *frame) {
  if (!frame || !frame->data) {
    return 0;
  }
  if (frame->width < YLEULC_MIN_CAPTURE_WIDTH) {
    return 0;
  }
  if (frame->height < YLEULC_MIN_CAPTURE_HEIGHT) {
    return 0;
  }
  return 1;
}
static void yleulcConsiderOverlay(Display *dpy, Window w, const char *wanted, YleulcOverlay *best) {
  XClassHint hint;
  if (!XGetClassHint(dpy, w, &hint)) {
    return;
  }
  int match = 0;
  if (hint.res_class && strcmp(hint.res_class, wanted) == 0) {
    match = 1;
  }
  if (hint.res_name && strcmp(hint.res_name, wanted) == 0) {
    match = 1;
  }
  if (hint.res_name) {
    XFree(hint.res_name);
  }
  if (hint.res_class) {
    XFree(hint.res_class);
  }
  if (!match) {
    return;
  }
  XWindowAttributes attrs;
  if (!XGetWindowAttributes(dpy, w, &attrs)) {
    return;
  }
  if (attrs.map_state != IsViewable) {
    return;
  }
  if (attrs.class == InputOnly) {
    return;
  }
  int gx;
  int gy;
  unsigned int gw;
  unsigned int gh;
  if (!yleulcRootGeometry(dpy, w, &gx, &gy, &gw, &gh)) {
    return;
  }
  if (gw == 0 || gh == 0) {
    return;
  }
  unsigned long area = (unsigned long)gw * (unsigned long)gh;
  unsigned long bestArea = 0;
  if (best->present) {
    bestArea = (unsigned long)best->width * (unsigned long)best->height;
  }
  if (!best->present || area > bestArea) {
    best->window = w;
    best->x = gx;
    best->y = gy;
    best->width = gw;
    best->height = gh;
    best->present = 1;
  }
}
static void yleulcScanTree(Display *dpy, Window w, const char *wanted, int depth, YleulcOverlay *best) {
  if (depth > YLEULC_TREE_DEPTH_MAX) {
    return;
  }
  yleulcConsiderOverlay(dpy, w, wanted, best);
  Window rootr;
  Window parentr;
  Window *kids = NULL;
  unsigned int nkids = 0;
  if (!XQueryTree(dpy, w, &rootr, &parentr, &kids, &nkids)) {
    return;
  }
  for (unsigned int i = 0; i < nkids; i++) {
    yleulcScanTree(dpy, kids[i], wanted, depth + 1, best);
  }
  if (kids) {
    XFree(kids);
  }
}
static YleulcOverlay yleulcLocateOverlay(Display *dpy, const char *wanted) {
  YleulcOverlay best;
  best.window = 0;
  best.x = 0;
  best.y = 0;
  best.width = 0;
  best.height = 0;
  best.present = 0;
  yleulcScanTree(dpy, DefaultRootWindow(dpy), wanted, 0, &best);
  return best;
}
static Window *yleulcFetchStacking(Display *dpy, unsigned int *outCount) {
  *outCount = 0;
  Atom stacking = XInternAtom(dpy, "_NET_CLIENT_LIST_STACKING", False);
  Atom actual = None;
  int format = 0;
  unsigned long items = 0;
  unsigned long after = 0;
  unsigned char *prop = NULL;
  if (XGetWindowProperty(dpy, DefaultRootWindow(dpy), stacking, 0, 16384, False, XA_WINDOW, &actual, &format, &items, &after, &prop) != Success) {
    return NULL;
  }
  if (!prop) {
    return NULL;
  }
  *outCount = (unsigned int)items;
  return (Window *)prop;
}
static int yleulcStackingIndex(Window *stack, unsigned int count, Window wanted) {
  for (unsigned int i = 0; i < count; i++) {
    if (stack[i] == wanted) {
      return (int)i;
    }
  }
  return -1;
}
static void yleulcBlendTile(XImage *frame, int destX, int destY, XImage *tile, int tileW, int tileH) {
  if (!frame || !tile || !frame->data || !tile->data) {
    return;
  }
  if (frame->bits_per_pixel == 32 && tile->bits_per_pixel == 32) {
    int useTileDepth = tile->depth;
    for (int y = 0; y < tileH; y++) {
      int fy = destY + y;
      if (fy < 0 || fy >= frame->height || y >= tile->height) {
        continue;
      }
      char *frow = frame->data + (size_t)fy * (size_t)frame->bytes_per_line;
      char *srow = tile->data + (size_t)y * (size_t)tile->bytes_per_line;
      for (int x = 0; x < tileW; x++) {
        int fx = destX + x;
        if (fx < 0 || fx >= frame->width || x >= tile->width) {
          continue;
        }
        unsigned char *sp = (unsigned char *)(srow + (size_t)x * 4);
        unsigned char *dp = (unsigned char *)(frow + (size_t)fx * 4);
        if (useTileDepth == 32) {
          unsigned int alpha = sp[3];
          if (alpha == 0) {
            continue;
          }
          if (alpha == 255) {
            dp[0] = sp[0];
            dp[1] = sp[1];
            dp[2] = sp[2];
            dp[3] = sp[3];
          } else {
            unsigned int inv = 255 - alpha;
            dp[0] = (unsigned char)((sp[0] * alpha + dp[0] * inv + 127) / 255);
            dp[1] = (unsigned char)((sp[1] * alpha + dp[1] * inv + 127) / 255);
            dp[2] = (unsigned char)((sp[2] * alpha + dp[2] * inv + 127) / 255);
          }
        } else {
          dp[0] = sp[0];
          dp[1] = sp[1];
          dp[2] = sp[2];
          dp[3] = sp[3];
        }
      }
    }
    return;
  }
  for (int y = 0; y < tileH; y++) {
    int fy = destY + y;
    if (fy < 0 || fy >= frame->height || y >= tile->height) {
      continue;
    }
    for (int x = 0; x < tileW; x++) {
      int fx = destX + x;
      if (fx < 0 || fx >= frame->width || x >= tile->width) {
        continue;
      }
      XPutPixel(frame, fx, fy, XGetPixel(tile, x, y));
    }
  }
}
static void yleulcTrackPixmap(Pixmap pm) {
  pthread_mutex_lock(&yleulcFifoLock);
  for (unsigned int i = 0; i < yleulcPixmapCount; i++) {
    if (yleulcPixmapFifo[i] == pm) {
      pthread_mutex_unlock(&yleulcFifoLock);
      return;
    }
  }
  if (yleulcPixmapCount < YLEULC_FIFO_CAP) {
    yleulcPixmapFifo[yleulcPixmapCount] = pm;
    yleulcPixmapCount++;
  } else {
    yleulcPixmapFifo[yleulcPixmapNext] = pm;
    yleulcPixmapNext = (yleulcPixmapNext + 1) % YLEULC_FIFO_CAP;
  }
  pthread_mutex_unlock(&yleulcFifoLock);
}
static int yleulcPixmapKnown(Pixmap pm) {
  int found = 0;
  pthread_mutex_lock(&yleulcFifoLock);
  for (unsigned int i = 0; i < yleulcPixmapCount; i++) {
    if (yleulcPixmapFifo[i] == pm) {
      found = 1;
      break;
    }
  }
  pthread_mutex_unlock(&yleulcFifoLock);
  return found;
}
static int yleulcRepaintRegion(XImage *frame, Display *dpy, int rx, int ry, unsigned int rw, unsigned int rh, Window *stack, int belowExclusive) {
  int painted = 0;
  int rx2 = rx + (int)rw;
  int ry2 = ry + (int)rh;
  for (int i = 0; i < belowExclusive; i++) {
    Window w = stack[i];
    XWindowAttributes attrs;
    if (!XGetWindowAttributes(dpy, w, &attrs)) {
      continue;
    }
    if (attrs.map_state != IsViewable) {
      continue;
    }
    if (attrs.class == InputOnly) {
      continue;
    }
    if (attrs.depth != 24 && attrs.depth != 32) {
      continue;
    }
    int ax;
    int ay;
    unsigned int aw;
    unsigned int ah;
    if (!yleulcRootGeometry(dpy, w, &ax, &ay, &aw, &ah)) {
      continue;
    }
    int ix = ax > rx ? ax : rx;
    int iy = ay > ry ? ay : ry;
    int ax2 = ax + (int)aw;
    int ay2 = ay + (int)ah;
    int ix2 = ax2 < rx2 ? ax2 : rx2;
    int iy2 = ay2 < ry2 ? ay2 : ry2;
    if (ix >= ix2 || iy >= iy2) {
      continue;
    }
    int iw = ix2 - ix;
    int ih = iy2 - iy;
    XImage *tile = XGetImage(dpy, w, ix - ax, iy - ay, (unsigned int)iw, (unsigned int)ih, AllPlanes, ZPixmap);
    if (tile) {
      yleulcBlendTile(frame, ix, iy, tile, iw, ih);
      XDestroyImage(tile);
      painted++;
    }
  }
  return painted;
}
static void yleulcRewriteFrame(XImage *frame) {
  if (!yleulcCaptureLargeEnough(frame)) {
    return;
  }
  if (pthread_mutex_trylock(&yleulcRewriteLock) != 0) {
    return;
  }
  if (!yleulcHookFired) {
    yleulcHookFired = 1;
    yleulcLog("capture hook fired (pid=%d)", (int)getpid());
  }
  Display *dpy = yleulcAcquireDisplay();
  if (!dpy) {
    pthread_mutex_unlock(&yleulcRewriteLock);
    return;
  }
  const char *wanted = getenv(YLEULC_OVERLAY_ENV);
  if (!wanted || wanted[0] == '\0') {
    wanted = YLEULC_DEFAULT_CLASS;
  }
  YleulcOverlay found = yleulcLocateOverlay(dpy, wanted);
  int overlayUsable = found.present && found.width >= YLEULC_MIN_OVERLAY_WIDTH && found.height >= YLEULC_MIN_OVERLAY_HEIGHT;
  YleulcRect region;
  region.x = 0;
  region.y = 0;
  region.width = 0;
  region.height = 0;
  int haveRegion = 0;
  if (overlayUsable) {
    if (yleulcPrevValid) {
      int ax = found.x < yleulcPrevX ? found.x : yleulcPrevX;
      int ay = found.y < yleulcPrevY ? found.y : yleulcPrevY;
      int fx2 = found.x + (int)found.width;
      int px2 = yleulcPrevX + (int)yleulcPrevWidth;
      int fy2 = found.y + (int)found.height;
      int py2 = yleulcPrevY + (int)yleulcPrevHeight;
      int bx2 = fx2 > px2 ? fx2 : px2;
      int by2 = fy2 > py2 ? fy2 : py2;
      region.x = ax;
      region.y = ay;
      region.width = (unsigned int)(bx2 - ax);
      region.height = (unsigned int)(by2 - ay);
    } else {
      region.x = found.x;
      region.y = found.y;
      region.width = found.width;
      region.height = found.height;
    }
    haveRegion = 1;
  } else if (yleulcPrevValid) {
    region.x = yleulcPrevX;
    region.y = yleulcPrevY;
    region.width = yleulcPrevWidth;
    region.height = yleulcPrevHeight;
    haveRegion = 1;
  }
  if (!haveRegion) {
    pthread_mutex_unlock(&yleulcRewriteLock);
    return;
  }
  unsigned int nstack = 0;
  Window *stack = yleulcFetchStacking(dpy, &nstack);
  if (!stack) {
    if (overlayUsable) {
      yleulcPrevX = found.x;
      yleulcPrevY = found.y;
      yleulcPrevWidth = found.width;
      yleulcPrevHeight = found.height;
      yleulcPrevValid = 1;
    } else {
      yleulcPrevValid = 0;
    }
    pthread_mutex_unlock(&yleulcRewriteLock);
    return;
  }
  int below = (int)nstack;
  Window activeWindow = 0;
  YleulcRect activeRect = region;
  if (overlayUsable) {
    int idx = yleulcStackingIndex(stack, nstack, found.window);
    if (idx < 0) {
      YleulcOverlay fallback;
      fallback.window = 0;
      fallback.x = 0;
      fallback.y = 0;
      fallback.width = 0;
      fallback.height = 0;
      fallback.present = 0;
      for (unsigned int i = 0; i < nstack; i++) {
        yleulcConsiderOverlay(dpy, stack[i], wanted, &fallback);
      }
      if (fallback.present && fallback.width >= YLEULC_MIN_OVERLAY_WIDTH && fallback.height >= YLEULC_MIN_OVERLAY_HEIGHT) {
        found = fallback;
        idx = yleulcStackingIndex(stack, nstack, found.window);
        if (yleulcPrevValid) {
          int ax = found.x < yleulcPrevX ? found.x : yleulcPrevX;
          int ay = found.y < yleulcPrevY ? found.y : yleulcPrevY;
          int fx2 = found.x + (int)found.width;
          int px2 = yleulcPrevX + (int)yleulcPrevWidth;
          int fy2 = found.y + (int)found.height;
          int py2 = yleulcPrevY + (int)yleulcPrevHeight;
          int bx2 = fx2 > px2 ? fx2 : px2;
          int by2 = fy2 > py2 ? fy2 : py2;
          region.x = ax;
          region.y = ay;
          region.width = (unsigned int)(bx2 - ax);
          region.height = (unsigned int)(by2 - ay);
          activeRect = region;
        } else {
          activeRect.x = found.x;
          activeRect.y = found.y;
          activeRect.width = found.width;
          activeRect.height = found.height;
          region = activeRect;
        }
      }
    }
    if (idx < 0) {
      XFree(stack);
      yleulcPrevX = found.x;
      yleulcPrevY = found.y;
      yleulcPrevWidth = found.width;
      yleulcPrevHeight = found.height;
      yleulcPrevValid = 1;
      pthread_mutex_unlock(&yleulcRewriteLock);
      return;
    }
    below = idx;
    activeWindow = found.window;
    activeRect.x = found.x;
    activeRect.y = found.y;
    activeRect.width = found.width;
    activeRect.height = found.height;
  } else {
    below = (int)nstack;
    activeWindow = 0;
    activeRect = region;
  }
  int painted = yleulcRepaintRegion(frame, dpy, region.x, region.y, region.width, region.height, stack, below);
  XFree(stack);
  yleulcFrameTotal++;
  time_t now = time(NULL);
  if (yleulcFrameTotal == 1 || now - yleulcLastRewriteLog >= YLEULC_LOG_THROTTLE_SEC) {
    yleulcLastRewriteLog = now;
    yleulcLog("rewrote overlay 0x%lx rect %d,%d %ux%u from %d windows (frames=%lu)", (unsigned long)activeWindow, activeRect.x, activeRect.y, activeRect.width, activeRect.height, painted, yleulcFrameTotal);
  }
  if (overlayUsable) {
    yleulcPrevX = found.x;
    yleulcPrevY = found.y;
    yleulcPrevWidth = found.width;
    yleulcPrevHeight = found.height;
    yleulcPrevValid = 1;
  } else {
    yleulcPrevValid = 0;
  }
  pthread_mutex_unlock(&yleulcRewriteLock);
}
XImage *XShmCreateImage(Display *dpy, Visual *visual, unsigned int depth, int format, char *data, XShmSegmentInfo *shminfo, unsigned int width, unsigned int height) {
  static XImage *(*nextCreateImage)(Display *, Visual *, unsigned int, int, char *, XShmSegmentInfo *, unsigned int, unsigned int) = NULL;
  if (!nextCreateImage) {
    nextCreateImage = dlsym(RTLD_NEXT, "XShmCreateImage");
  }
  XImage *img = nextCreateImage(dpy, visual, depth, format, data, shminfo, width, height);
  if (img && width >= YLEULC_MIN_CAPTURE_WIDTH && height >= YLEULC_MIN_CAPTURE_HEIGHT) {
    pthread_mutex_lock(&yleulcFifoLock);
    yleulcShmFrame = img;
    pthread_mutex_unlock(&yleulcFifoLock);
  }
  return img;
}
Pixmap XShmCreatePixmap(Display *dpy, Drawable draw, char *data, XShmSegmentInfo *shminfo, unsigned int width, unsigned int height, unsigned int depth) {
  static Pixmap (*nextCreatePixmap)(Display *, Drawable, char *, XShmSegmentInfo *, unsigned int, unsigned int, unsigned int) = NULL;
  if (!nextCreatePixmap) {
    nextCreatePixmap = dlsym(RTLD_NEXT, "XShmCreatePixmap");
  }
  Pixmap pm = nextCreatePixmap(dpy, draw, data, shminfo, width, height, depth);
  if (pm && width >= YLEULC_MIN_CAPTURE_WIDTH && height >= YLEULC_MIN_CAPTURE_HEIGHT) {
    yleulcTrackPixmap(pm);
  }
  return pm;
}
int XCopyArea(Display *dpy, Drawable src, Drawable dest, GC gc, int sx, int sy, unsigned int w, unsigned int h, int dx, int dy) {
  static int (*nextCopyArea)(Display *, Drawable, Drawable, GC, int, int, unsigned int, unsigned int, int, int) = NULL;
  if (!nextCopyArea) {
    nextCopyArea = dlsym(RTLD_NEXT, "XCopyArea");
  }
  int rc = nextCopyArea(dpy, src, dest, gc, sx, sy, w, h, dx, dy);
  if (yleulcPixmapKnown(dest)) {
    XImage *frame = NULL;
    pthread_mutex_lock(&yleulcFifoLock);
    frame = yleulcShmFrame;
    pthread_mutex_unlock(&yleulcFifoLock);
    if (frame && yleulcIsRoot(dpy, src)) {
      XSync(dpy, False);
      yleulcRewriteFrame(frame);
    }
  }
  return rc;
}
Status XShmGetImage(Display *dpy, Drawable draw, XImage *image, int x, int y, unsigned long plane) {
  static Status (*nextShmGet)(Display *, Drawable, XImage *, int, int, unsigned long) = NULL;
  if (!nextShmGet) {
    nextShmGet = dlsym(RTLD_NEXT, "XShmGetImage");
  }
  Status st = nextShmGet(dpy, draw, image, x, y, plane);
  if (st && image && yleulcCaptureLargeEnough(image) && yleulcIsRoot(dpy, draw)) {
    yleulcRewriteFrame(image);
  }
  return st;
}
XImage *XGetImage(Display *dpy, Drawable draw, int x, int y, unsigned int w, unsigned int h, unsigned long plane, int format) {
  static XImage *(*nextGetImage)(Display *, Drawable, int, int, unsigned int, unsigned int, unsigned long, int) = NULL;
  if (!nextGetImage) {
    nextGetImage = dlsym(RTLD_NEXT, "XGetImage");
  }
  XImage *img = nextGetImage(dpy, draw, x, y, w, h, plane, format);
  if (img && yleulcCaptureLargeEnough(img) && yleulcIsRoot(dpy, draw)) {
    yleulcRewriteFrame(img);
  }
  return img;
}
__attribute__((constructor)) static void yleulcStartup(void) {
  yleulcLog("loaded pid=%d", (int)getpid());
}
