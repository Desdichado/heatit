#include <LiquidCrystal.h>
#include <ArduinoJson.h>
#include "WiFiS3.h"
#include "WiFiSSLClient.h"
#include "IPAddress.h"
#include <OneWire.h>
#include <DallasTemperature.h>
#include "max6675.h"



#define PARAMETERS JsonObject
//Tempsensor
// Data wire is plugged into pin 2 on the Arduino , You are free to take another one
#define ONE_WIRE_BUS 13

DynamicJsonDocument doc(2048);

char ssid[] = "kmesh";     //wifi network name
char pass[] = "1Ske.aip";  //wifi network password
//char ssid[] = "B-WiFi";     //wifi network name
//char pass[] = "K8nd2bSX9?";  //wifi network password

int status = WL_IDLE_STATUS;
const char server[] = "heatit.k-mit.se";  // name address for server using dns
const int port = 443;
unsigned long lastConnectionTime = 0;               // last time you connected to the server, in milliseconds
const unsigned long postingInterval = 10L * 1000L;  // delay between updates, in milliseconds
int thermoDO = 6;
int thermoCS = 7;
int thermoCLK = 8;
int sensorCount = 2;
char sensorpathstring[100] = "/.netlify/functions/sensorvalues";

String nextSend = "";

//HARDWARE INIT
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
int heaterPins[] = { 9, 10, 13 };
int fanPin = 0;
int pumpPin = 1;
WiFiSSLClient client;
MAX6675 thermocouple(thermoCLK, thermoCS, thermoDO);
OneWire oneWire(ONE_WIRE_BUS);        // Setup a oneWire instance to communicate with any OneWire devices
DallasTemperature sensors(&oneWire);  // Pass our oneWire reference to Dallas Temperature.
//testvärden

typedef struct {
  String type;
  String id;
} SensorStruct;
SensorStruct sensorTries[2] = {
  (SensorStruct){ "temp water", "waterTank" },
  (SensorStruct){ "temp pipe", "heaterExit" }
};



//**********************************************************************************
void setup() {
  //serializeJson(createJson, createJsonString);

  //Initialize serial lcd and sensor and wait for serial port to open:
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


void loop() {
  //sensors.requestTemperatures();  // Send the command to get temperatures from dallas sensors.
  // if the server's disconnected, stop the client:
  if (!client.connected()) {
    lcd.clear();
    lcd.print("disconnecting from server.");
    client.stop();
  }
  // Print the temps of the dallas sensors to the lcd and add it to be sent to server*********
  String sensorstring;

  nextSend = "[";
  for (int a = 0; a < sensorCount; a++) {
    float tempsensorstring = random(30, 90);  //sensors.getTempCByIndex(a);
    int tempsensorcount = a;
    addSensorValueToNextSend(tempsensorstring, sensorTries[a].type, sensorTries[a].id);
    sensorstring = tempsensorstring + String(tempsensorcount) + String(":") + tempsensorstring + String(" ");
  }
  nextSend = nextSend.substring(0, nextSend.lastIndexOf(","));
  nextSend += "]";
  lcd.clear();
  //  Serial.println(sensorstring);
  httpRequest();
  delay(8000);
  read_response();
  // *********
  delay(20000);
}

// { "@timestamp": "2099-05-06T16:21:15.000Z", "sensorValue": 26.1, "sensorType": "temp", "sensorId": "d2" }
void addSensorValueToNextSend(float sensorValue, String sensorType, String sensorId) {
  nextSend += "{\"sensorType\": \"" + sensorType + "\", \"sensorId\": \"" + sensorId + "\", \"sensorValue\": " + sensorValue + "},";
}

// this method makes a HTTP connection to the server:
/* -------------------------------------------------------------------------- */
void httpRequest() {
  /* -------------------------------------------------------------------------- */
  if (nextSend.length() < 1) {
    Serial.println("Nothing to send. Returning.");
    return;
  }
  client.stop();
  Serial.println("Connectiong to " + String(server) + " on port: " + String(port));
  Serial.println("with size: " + String(nextSend.length() + 1));
  client.setTimeout(1000);
  // if theres a successful connection:
  if (client.connect(server, port)) {
    Serial.println("connecting to: " + String(server) + String(sensorpathstring));

    // send the HTTP POST request:
    client.println("POST " + String(sensorpathstring) + " HTTP/1.1");
    client.println("Host: " + String(server));
    client.println("Content-Type: application/json");
    client.println("Content-Length: " + String(nextSend.length() + 1));
    client.println("User-Agent: ArduinoWiFi/1.1");
    client.println("Connection: close");
    client.println();
    client.println(nextSend + String("\n"));
    Serial.println(nextSend + String("\n"));
  } else {
    // if you couldn't make a connection:
    Serial.println("connection failed");
  }
}

/* just wrap the received data up to 80 columns in the serial print*/
/* -------------------------------------------------------------------------- */
void read_response() {
  /* -------------------------------------------------------------------------- */
  // Check HTTP status

  String response = "";
  unsigned long timeout = 10000;  // 10 seconds timeout
  unsigned long startTime = millis();

  while (client.connected() || client.available()) {
    while (client.available()) {
      char c = client.read();
      response += c;
    }

    if (millis() - startTime > timeout) {
      Serial.println(F("Timeout while reading response."));
      break;
    }
  }
  int startstr = response.indexOf("{ \"message");
  int stopstr = response.indexOf("}]}");
  String responseCut = response.substring(startstr, stopstr + 3);
  Serial.println(responseCut);  // Print the full response

  DeserializationError error = deserializeJson(doc, responseCut);
  if (error) {
    Serial.print(F("deserializeJson() failed: "));
    Serial.println(error.f_str());
    return;
  }
  const char* command = doc["command"];
  Serial.println(command);

  JsonArray commandsArray = doc["commands"];
  for (JsonObject commandObj : commandsArray) {
    const char* cmd = commandObj["command"];
    const char* value = commandObj["value"];
    Serial.print("Command: ");
    Serial.print(cmd);
    Serial.print(", Value: ");
    Serial.println(value);
    controlRelay(cmd, value);
  }
  // Disconnect
  client.stop();
}

void controlRelay(String device, String value) {
  int pinStatus = (value == "on") ? HIGH : LOW;
  if (device == "heater") {
    int elementCount = sizeof(heaterPins) / sizeof(int);
    for (int a = 0; a < elementCount; a++) {
      digitalWrite(heaterPins[a], pinStatus);
      Serial.println("Turned heater on for pin " + String(heaterPins[a]) + " " + value);
    }
  } else {
    int pin = (device == "fan") ? fanPin : pumpPin;
    digitalWrite(pin, pinStatus);
    Serial.println("Turned " + device + " on. pin " + String(pin));
  }
}

void connectWiFi() {
  // check for the WiFi module:
  if (WiFi.status() == WL_NO_MODULE) {
    lcd.clear();
    lcd.print("Communication with WiFi module failed!");
    // don't continue
    while (true)
      ;
  }

  String fv = WiFi.firmwareVersion();
  if (fv < WIFI_FIRMWARE_LATEST_VERSION) {
    lcd.clear();
    lcd.print("Please upgrade the firmware");
  }

  // attempt to connect to WiFi network:
  int counter = 1;
  while (status != WL_CONNECTED) {
    lcd.clear();
    lcd.print("try ");
    lcd.print(counter);
    lcd.print(" SSID: ");
    lcd.setCursor(0, 1);
    lcd.print(ssid);
    // Connect to WPA/WPA2 network. Change this line if using open or WEP network:
    status = WiFi.begin(ssid, pass);

    // wait 7 seconds for connection:
    delay(7000);
    counter++;
  }
}

/* -------------------------------------------------------------------------- */
void printWifiStatus() {
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

  // print the received signal strength:
  /*long rssi = WiFi.RSSI();
  Serial.print("signal strength (RSSI):");
  Serial.print(rssi);
  Serial.println(" dBm");*/
}

void waitForSerialtoStart() {
  while (!Serial) {
    lcd.clear();
    lcd.print("waiting for serial port to connect");  //Needed for native USB port only
  }
  return;
}

void setSensorCount() {
  if (sensors.getDeviceCount() > 0) {
    sensorCount = sensors.getDeviceCount();
  }
  return;
}