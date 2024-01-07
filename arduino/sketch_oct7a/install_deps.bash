#! /bin/bash

# Check if the arduino cli is installed, otherwise tell how to install it and terminate
if ! command -v arduino-cli &> /dev/null
then
    echo "arduino-cli could not be found"
    echo "Please install it by running the following command:"
    echo "brew install arduino-cli"
    exit
fi

arduino-cli lib install \
  LiquidCrystal@1.0.7 \
  ArduinoJson@7.0.0 \
  DallasTemperature@3.9.0 \
  MAX6675@0.2.0 \
  "MAX6675 library"@1.1.2 \
  OneWire@2.3.7 \
  ArduinoHttpClient@0.5.0

