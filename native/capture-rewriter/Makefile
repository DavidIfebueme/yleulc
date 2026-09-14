CC = cc
CFLAGS = -O2 -fPIC -Wall -Wextra
LDFLAGS = -shared
LDLIBS = -ldl -lX11 -lXext -lpthread
TARGET = capture_rewriter.so
SRC = capture_rewriter.c
all: $(TARGET)
$(TARGET): $(SRC)
	$(CC) $(CFLAGS) $(LDFLAGS) -o $(TARGET) $(SRC) $(LDLIBS)
clean:
	rm -f $(TARGET)
