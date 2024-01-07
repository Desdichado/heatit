# Sand pit controller for the Arduino

## Before you start

The following steps are required before you can compile or deploy the code to the Arduino.

### Installing dependencies

Please use

```bash
bash install_dependencies.bash
```

To make sure all the correct dependencies of the correct versions are installed.
Use said file to include any other dependencies you may need.

### Connecting to wifi

A wifi SSID and password must be defined for the code to compile.
This is done by creating a file called wifiConfig in this directory.
This is a example of what the file should look like:

```c++
#define wifi_ssid "my_wifi_ssid"
#define wifi_password "super secret password"
```

This file is porously ignored by git to prevent the wifi password from being uploaded to our public github repository.

### Configure arduino connection

You also need to configure the arduino connection. Please check the arduino documentation for how to do this.
The board we are using is the Arduino Uno R4 Wifi.
