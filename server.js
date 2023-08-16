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
        res.json({ message: "Data received, saved, and forwarded", elastic_response: response.data });
        console.log ("Data received, saved, and forwarded");
    } catch (error) {
        res.status(500).json({ message: "Error forwarding data to Elasticsearch", error: error.message });
    }
});


app.listen(8081, () => {
    console.log('Server running on port 8081');
});
