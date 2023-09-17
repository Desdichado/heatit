const { Client } = require('@elastic/elasticsearch')
require('array.prototype.flatmap').shim();
var returnCommands = [];
exports.handler = async (event, context) => {
        const client = new Client({
        cloud: {
            id: 'kmit-production:ZXUtY2VudHJhbC0xLmF3cy5jbG91ZC5lcy5pbzo0NDMkOTU4MWJkZjRjYjVkNGI0YjliYzE0ODJiODRlZTcwZDYkOTkwYTNlMzk4YTk1NDc2NWIwNzhiNmJmZWViNTNlMGE=',
        },
        auth: {
                username: 'elastic',
                password: 'pvskHbs7Hg6FntlurwDwYi6o',
        }
    });
    const data = JSON.parse(event.body);
        // Validate the data structure
        if (!Array.isArray(data)) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': '*',
                    'Access-Control-Allow-Headers': '*',
                    'Access-Control-Allow-Credentials': 'true'
                },
                body: "{message: 'Data should be an array of sensor readings', data: " + JSON.stringify(data) + "}"
            };
        }
    
        const bulkData = [];
        returnCommands = [];
        for (const entry of data) {
            bulkData.push(JSON.stringify({
                "@timestamp": new Date().toISOString(),
                "sensorValue": entry.sensorValue,
                "sensorType": entry.sensorType,
                "sensorId": entry.sensorId
            }));
            logicEval(entry);
        }
        filterCommands(returnCommands);
        // Save data locally
        //fs.appendFileSync(DATA_FILE, bulkData.join('\n'));
    
        // Forward data to Elasticsearch
        const operations = bulkData.flatMap(doc => [{ index: { _index: 'sandbatteri-stream-dev' } }, doc])

        const bulkResponse = await client.bulk({ refresh: true, operations })
      
        if (bulkResponse.errors) {
          const erroredDocuments = []
          // The items array has the same order of the dataset we just indexed.
          // The presence of the `error` key indicates that the operation
          // that we did for the document has failed.
          bulkResponse.items.forEach((action, i) => {
            const operation = Object.keys(action)[0]
            if (action[operation].error) {
              erroredDocuments.push({
                // If the status is 429 it means that you can retry the document,
                // otherwise it's very likely a mapping error, and you should
                // fix the document before to try it again.
                status: action[operation].status,
                error: action[operation].error,
                operation: operations[i * 2],
                document: operations[i * 2 + 1]
              })
            }
          })
          console.log(erroredDocuments)
        }
      
        //const count = await client.count({ index: 'sandbatteri-stream-dev' })
        //console.log(count)
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': '*',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Credentials': 'true'
            },
            body: "{ message: \"Data received, saved, and forwarded\", commands: "+JSON.stringify(returnCommands)+"}"
        };
      }
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Credentials': 'true'
        },
        body: "{status: 'ok'}"
    };

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

//remove double commands and return the prioritized value
function filterCommands(commands){
    var prioritizedValues = [{command: "heater", value: "off"}, {command: "fan", value: "off"}, {command: "pump", value: "off"}];
    var filteredCommands = [];
    var foundCommands = [];
    for (const command of commands){
        if (foundCommands.includes(command.command)){
            continue;
        }
        foundCommands.push(command.command);
        filteredCommands.push(prioritizedValues.find(x => x.command == command.command));
    }
    returnCommands = filteredCommands;
}