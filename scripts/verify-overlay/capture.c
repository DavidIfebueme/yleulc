#include <stdio.h>
#include <stdlib.h>
#include <X11/Xlib.h>
#include <X11/Xutil.h>

static int verifyTrailingZeros(unsigned long mask) {
  int shift = 0;
  while ((mask & 1UL) == 0UL) {
    mask >>= 1;
    shift++;
  }
  return shift;
}

static int verifyMaskWidth(unsigned long mask) {
  int width = 0;
  while ((mask & 1UL) == 1UL) {
    mask >>= 1;
    width++;
  }
  return width;
}

static unsigned char verifyChannel(unsigned long pixel, unsigned long mask) {
  if (mask == 0UL) {
    return 0;
  }
  int shift = verifyTrailingZeros(mask);
  unsigned long body = mask >> shift;
  int width = verifyMaskWidth(body);
  unsigned long raw = (pixel & mask) >> shift;
  if (width >= 8) {
    return (unsigned char)(raw & 0xFFUL);
  }
  if (width == 0) {
    return 0;
  }
  return (unsigned char)((raw * 255UL) / ((1UL << width) - 1UL));
}

int main(int argc, char **argv) {
  if (argc != 2) {
    fprintf(stderr, "VERIFY_FAIL usage-capture-output\n");
    return 2;
  }
  Display *display = XOpenDisplay(NULL);
  if (display == NULL) {
    fprintf(stderr, "VERIFY_FAIL no-display\n");
    return 1;
  }
  int screen = DefaultScreen(display);
  Window root = RootWindow(display, screen);
  unsigned int width = (unsigned int)DisplayWidth(display, screen);
  unsigned int height = (unsigned int)DisplayHeight(display, screen);
  XImage *frame = XGetImage(display, root, 0, 0, width, height, AllPlanes, ZPixmap);
  if (frame == NULL) {
    fprintf(stderr, "VERIFY_FAIL capture-null\n");
    XCloseDisplay(display);
    return 1;
  }
  Visual *visual = DefaultVisual(display, screen);
  unsigned long redMask = visual->red_mask;
  unsigned long greenMask = visual->green_mask;
  unsigned long blueMask = visual->blue_mask;
  FILE *out = fopen(argv[1], "wb");
  if (out == NULL) {
    fprintf(stderr, "VERIFY_FAIL open-output\n");
    XDestroyImage(frame);
    XCloseDisplay(display);
    return 1;
  }
  fprintf(out, "P6\n%u %u\n255\n", width, height);
  for (int y = 0; y < (int)height; y++) {
    for (int x = 0; x < (int)width; x++) {
      unsigned long pixel = XGetPixel(frame, x, y);
      unsigned char rgb[3];
      rgb[0] = verifyChannel(pixel, redMask);
      rgb[1] = verifyChannel(pixel, greenMask);
      rgb[2] = verifyChannel(pixel, blueMask);
      if (fwrite(rgb, 1, 3, out) != 3) {
        fprintf(stderr, "VERIFY_FAIL write-output\n");
        fclose(out);
        XDestroyImage(frame);
        XCloseDisplay(display);
        return 1;
      }
    }
  }
  fclose(out);
  printf("CAPTURED %ux%u %s\n", width, height, argv[1]);
  XDestroyImage(frame);
  XCloseDisplay(display);
  return 0;
}
