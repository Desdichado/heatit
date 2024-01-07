#include <ArduinoHttpClient.h>
#include <LiquidCrystal.h>
#include <ArduinoJson.h>
#include "WiFiS3.h"
#include "WiFiSSLClient.h"
#include "IPAddress.h"
#include <OneWire.h>
#include <DallasTemperature.h>
#include "max6675.h"

#include "wifiConfig.h"

// Tempsensor
//  Data wire is plugged into pin 2 on the Arduino , You are free to take another one
#define ONE_WIRE_BUS 13

int status = WL_IDLE_STATUS;

// Api path constants
const char apiHost[] = "heatit.k-mit.se"; // name address for server using dns
const int apiPort = 443;
const char apiPath[] = "/.netlify/functions/sensorvalues";

unsigned long lastConnectionTime = 0;              // last time you connected to the server, in milliseconds
const unsigned long postingInterval = 10L * 1000L; // delay between updates, in milliseconds
int thermoDO = 6;
int thermoCS = 7;
int thermoCLK = 8;
int sensorCount = 2;

// HARDWARE INIT
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
int heaterPins[] = {9, 10, 13};
int fanPin = 0;
int pumpPin = 1;
WiFiSSLClient wifiClient;
HttpClient httpClient = HttpClient(wifiClient, apiHost, apiPort);
MAX6675 thermocouple(thermoCLK, thermoCS, thermoDO);
OneWire oneWire(ONE_WIRE_BUS);       // Setup a oneWire instance to communicate with any OneWire devices
DallasTemperature sensors(&oneWire); // Pass our oneWire reference to Dallas Temperature.
// testvärden

enum ThermometerLocation
{
  waterTank,
  heaterExit
};

char *sensorLocationToString(ThermometerLocation location)
{
  switch (location)
  {
  case waterTank:
    return "waterTank";
  case heaterExit:
    return "heaterExit";
  default:
    return "unknown";
  }
}

class Thermometer
{
public:
  Thermometer(ThermometerLocation location)
  {
    this->location = location;
  }
  void writeSensorReading(JsonObject &json)
  {
    json["location"] = sensorLocationToString(this->getLocation());
    json["temperatureC"] = this->getTemperatureC();
  }
  virtual int getTemperatureC()
  {
    return 0;
  }
  ThermometerLocation getLocation()
  {
    return this->location;
  }

private:
  ThermometerLocation location;
};

class MockThermometer : public Thermometer
{
public:
  MockThermometer(ThermometerLocation location) : Thermometer(location) {}
  int getTemperatureC() override
  {
    return random(30, 90);
  }
};

// // Default values, should be over written if running in the wild
Thermometer *thermometers[] = {
    new MockThermometer(ThermometerLocation::waterTank),
    new MockThermometer(ThermometerLocation::heaterExit),
};

void setup()
{
  // serializeJson(createJson, createJsonString);

  // Initialize serial lcd and sensor and wait for serial port to open:
  Serial.begin(9600);
  lcd.begin(16, 2);
  sensors.begin();
  waitForSerialtoStart();
  connectWiFi();
  printWifiStatus();
  setSensorCount();
  lcd.clear();
  Serial.println("sensorCount: " + String(sensorCount));
}

//**********************************************************************************

void loop()
{
  // sensors.requestTemperatures();  // Send the command to get temperatures from dallas sensors.
  //  if the server's disconnected, stop the client:
  if (!wifiClient.connected())
  {
    lcd.clear();
    lcd.print("disconnecting from server.");
    wifiClient.stop();
  }

  JsonDocument requestBody;
  JsonArray sensorReadings = requestBody.to<JsonArray>();

  // Iterate through all the thermometers and add their readings to the requestBody
  for (auto &thermometer : thermometers)
  {
    JsonObject sensorReading = sensorReadings.add<JsonObject>();
    thermometer->writeSensorReading(sensorReading);
  }
  // Print the temps of the dallas sensors to the lcd and add it to be sent to server*********
  String requestBodyString;

  // Use pretty json for easier debugging
  serializeJsonPretty(requestBody, requestBodyString);
  Serial.println("requestBodyString: ");
  Serial.println(requestBodyString);
  httpClient.post(apiPath, "application/json", requestBodyString);
  int responseStatus = httpClient.responseStatusCode();
  String responseBodyString = httpClient.responseBody();
  JsonDocument responseBody;
  DeserializationError deserializationError = deserializeJson(responseBody, responseBodyString);
  if (deserializationError)
  {
    Serial.println("Failed to deserialize response body from sensorvalues api. Error: " + String(deserializationError.f_str()));
    Serial.println("responseBody: \n" + responseBodyString);
  }
  if (responseStatus != 200 || responseStatus != 201 || responseStatus != 202)
  {
    Serial.println("Failed request to report new sensor values and get new commands from sensorvalues api. Status code is not 200, 201 or 202, was: " + String(responseStatus));
    Serial.println("responseBody: \n" + responseBodyString);
  }

  JsonArray commands = responseBody["commands"];
  for (JsonObject command : commands)
  {
    const char *cmd = command["command"];
    const char *value = command["value"];
    Serial.print("Command: ");
    Serial.print(cmd);
    Serial.print(", Value: ");
    Serial.println(value);
    controlRelay(cmd, value);
  }

  delay(30000);
}

void controlRelay(String device, String value)
{
  int pinStatus = (value == "on") ? HIGH : LOW;
  if (device == "heater")
  {
    int elementCount = sizeof(heaterPins) / sizeof(int);
    for (int a = 0; a < elementCount; a++)
    {
      digitalWrite(heaterPins[a], pinStatus);
      Serial.println("Turned heater on for pin " + String(heaterPins[a]) + " " + value);
    }
  }
  else
  {
    int pin = (device == "fan") ? fanPin : pumpPin;
    digitalWrite(pin, pinStatus);
    Serial.println("Turned " + device + " on. pin " + String(pin));
  }
}

void connectWiFi()
{
  // check for the WiFi module:
  if (WiFi.status() == WL_NO_MODULE)
  {
    lcd.clear();
    String errorMessage = "Communication with WiFi module failed!";
    lcd.print(errorMessage);
    Serial.println(errorMessage);
    // don't continue
    while (true)
      ;
  }

  String fv = WiFi.firmwareVersion();
  if (fv < WIFI_FIRMWARE_LATEST_VERSION)
  {
    lcd.clear();
    String errorMessage = "Please upgrade the firmware";
    lcd.print(errorMessage);
    Serial.println(errorMessage);
  }

  // attempt to connect to WiFi network:
  int counter = 1;
  while (status != WL_CONNECTED)
  {
    lcd.clear();
    lcd.print("try " + String(counter) + " SSID: ");
    lcd.setCursor(0, 1);
    lcd.print(wifi_ssid);
    Serial.println("Attempting to connect to SSID: " + String(wifi_ssid) + "\nAttempt: " + String(counter) + "...");
    // Connect to WPA/WPA2 network. Change this line if using open or WEP network:
    status = WiFi.begin(wifi_ssid, wifi_password);
    // wait 7 seconds for connection:
    delay(7000);
    if (status != WL_CONNECTED)
    {
      Serial.println("Connecting to " + String(wifi_ssid) + " failed. Will keep retrying until connection is successful ...");
    }
    counter++;
  }
  Serial.println("Successfully connected to wifi " + String(wifi_ssid));
}

/* -------------------------------------------------------------------------- */
void printWifiStatus()
{
  /* -------------------------------------------------------------------------- */
  lcd.clear();
  // print the SSID of the network you're attached to:
  lcd.print("SSID: ");
  lcd.print(WiFi.SSID());
  lcd.setCursor(0, 1);
  // print your board's IP address:
  IPAddress ip = WiFi.localIP();
  lcd.print("IP: ");
  lcd.println(ip);
}

void waitForSerialtoStart()
{
  while (!Serial)
  {
    lcd.clear();
    lcd.print("waiting for serial port to connect"); // Needed for native USB port only
  }
  Serial.println("Serial port connected");
}

void setSensorCount()
{
  if (sensors.getDeviceCount() > 0)
  {
    sensorCount = sensors.getDeviceCount();
  }
}
