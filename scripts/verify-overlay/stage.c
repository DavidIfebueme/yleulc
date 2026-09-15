#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/Xatom.h>

static unsigned long verifyNamedPixel(Display *display, int screen, const char *name) {
  Colormap colormap = DefaultColormap(display, screen);
  XColor exact;
  XColor closest;
  if (XAllocNamedColor(display, colormap, name, &closest, &exact) == 0) {
    return BlackPixel(display, screen);
  }
  return closest.pixel;
}

int main(void) {
  const char *wanted = getenv("YLEULC_VERIFY_CLASS");
  if (wanted == NULL || wanted[0] == '\0') {
    wanted = "yleulc-verify-overlay";
  }
  Display *display = XOpenDisplay(NULL);
  if (display == NULL) {
    fprintf(stderr, "VERIFY_FAIL no-display\n");
    return 1;
  }
  int screen = DefaultScreen(display);
  Window root = RootWindow(display, screen);
  unsigned int screenWidth = (unsigned int)DisplayWidth(display, screen);
  unsigned int screenHeight = (unsigned int)DisplayHeight(display, screen);
  int overlayX = 200;
  int overlayY = 150;
  unsigned int overlayWidth = 320;
  unsigned int overlayHeight = 200;
  if (screenWidth < (unsigned int)(overlayX + 320) || screenHeight < (unsigned int)(overlayY + 200)) {
    fprintf(stderr, "VERIFY_FAIL screen-too-small %ux%u\n", screenWidth, screenHeight);
    XCloseDisplay(display);
    return 1;
  }
  unsigned long backgroundPixel = verifyNamedPixel(display, screen, "#203040");
  unsigned long overlayPixel = verifyNamedPixel(display, screen, "#FF00FF");
  Window background = XCreateSimpleWindow(display, root, 0, 0, screenWidth, screenHeight, 0, BlackPixel(display, screen), backgroundPixel);
  XStoreName(display, background, "yleulc-verify-background");
  XMapWindow(display, background);
  Window overlay = XCreateSimpleWindow(display, root, overlayX, overlayY, overlayWidth, overlayHeight, 0, BlackPixel(display, screen), overlayPixel);
  XClassHint hint;
  size_t classLen = strlen(wanted) + 1;
  char *mutableClass = (char *)malloc(classLen);
  if (mutableClass == NULL) {
    fprintf(stderr, "VERIFY_FAIL out-of-memory\n");
    XCloseDisplay(display);
    return 1;
  }
  memcpy(mutableClass, wanted, classLen);
  hint.res_name = mutableClass;
  hint.res_class = mutableClass;
  XSetClassHint(display, overlay, &hint);
  XStoreName(display, overlay, "yleulc-verify-overlay");
  XMapWindow(display, overlay);
  XSync(display, False);
  usleep(300000);
  Atom stacking = XInternAtom(display, "_NET_CLIENT_LIST_STACKING", False);
  Window order[2];
  order[0] = background;
  order[1] = overlay;
  XChangeProperty(display, root, stacking, XA_WINDOW, 32, PropModeReplace, (unsigned char *)order, 2);
  XSync(display, False);
  free(mutableClass);
  printf("READY bg=0x%lx overlay=0x%lx rect=%d,%d,%u,%u class=%s screen=%ux%u\n", background, overlay, overlayX, overlayY, overlayWidth, overlayHeight, wanted, screenWidth, screenHeight);
  fflush(stdout);
  for (;;) {
    sleep(3600);
  }
  return 0;
}
