const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const axios = require('axios');
const app = express();
const cors = require('cors');

app.use(cors()); // cors is a function, you have to call that function
app.use(express.json());

const ELASTICSEARCH_URL = "https://9581bdf4cb5d4b4b9bc1482b84ee70d6.eu-central-1.aws.cloud.es.io";
const DATA_FILE = "sensor_data.json";
returnCommands = [];
app.use(bodyParser.json());

app.get('/', (req, res) => {
    const data = req.body;
    console.log(data);
    res.json({ message: "Hello from the server" });
});

app.post('/sensor', async (req, res) => {
    const data = req.body;

    // Validate the data structure
    if (!Array.isArray(data)) {
        return res.status(400).json({ message: "Data should be an array of sensor readings" });
    }

    const bulkData = [];
    for (const entry of data) {
        bulkData.push(JSON.stringify({ create: {} }));
        bulkData.push(JSON.stringify({
            "@timestamp": new Date().toISOString(),
            "sensorValue": entry.sensorValue,
            "sensorType": entry.sensorType,
            "sensorId": entry.sensorId
        }));
        logicEval(entry);
    }
    console.log(bulkData);
    // Save data locally
    fs.appendFileSync(DATA_FILE, bulkData.join('\n'));

    // Forward data to Elasticsearch using Axios
    try {
        const response = await axios.put(`${ELASTICSEARCH_URL}/sandbatteri-stream-dev/_bulk`, bulkData.join('\n') + '\n', {
            headers: {
                'Content-Type': 'application/x-ndjson',
                'Authorization':'Basic ZWxhc3RpYzpwdnNrSGJzN0hnNkZudGx1cndEd1lpNm8='
            }
        });
        res.json({ message: "Data received, saved, and forwarded", commands: JSON.stringify(returnCommands)});
        console.log ("Data received, saved, and forwarded");
    } catch (error) {
        res.status(200).json({ message: "Error forwarding data to Elasticsearch", error: error.message, commands: JSON.stringify(returnCommands) });
    }
});


app.listen(8081, () => {
    console.log('Server running on port 8081');
});
function logicEval(entry){
    if (entry.sensorType == "temp pipe"){
        switch(entry.sensorId){
            case "heaterEntry":
                if (entry.sensorValue > 630){
                    returnCommands.push({command: "heater", value: "off"});
                    console.log("Temperature before heater is too high. Turning off heater.");
                }
                break;
            case "heaterExit":
                if (entry.sensorValue > 630){
                    returnCommands.push({command: "heater", value: "off"});
                    console.log("Temperature after heater is too high. Turning off heater.");
                }
                break;
            default:
                console.log("unknown sensor id on "+entry.sensorType+": " + entry.sensorId);
                break;
        }
    }
    if (entry.sensorType == "temp water"){
        switch(entry.sensorId){
            case "waterExit":
                if (entry.sensorValue > 85){
                    returnCommands.push({command: "heater", value: "off"});
                    returnCommands.push({command: "fan", value: "off"});
                    console.log("Water temperature is too high, turning off heater and fan.");

                }
                break;
            case "waterEntry":
                if (entry.sensorValue > 80){
                    returnCommands.push({command: "fan", value: "off"});
                    returnCommands.push({command: "heater", value: "off"});
                    console.log("Temperature before heat transfer is too high. Turning off heater and fan.");
                }
                break;
            case "waterTank":
                if (entry.sensorValue > 90){
                    returnCommands.push({command: "pump", value: "off"});
                    console.log("Temperature in water tank is too high. Turning off pump.");
                }
                if (entry.sensorValue < 60){
                    returnCommands.push({command: "pump", value: "on"});
                    returnCommands.push({command: "heater", value: "on"});
                    returnCommands.push({command: "fan", value: "on"});
                    console.log("Temperature in water tank too low. Turning on heater, pump and fan.");
                }
                break;
           default:
                console.log("unknown sensor id on "+entry.sensorType+": " + entry.sensorId);
                break;
        }
    }
    if (entry.sensorType == "battery"){
        if (entry.sensorValue < 30){
            console.log("Battery is low");
        }
    }
}