const { Client } = require('@elastic/elasticsearch');
const fs = require('fs');
const { request } = require('graphql-request');
const { exit } = require('process');


const tibberUrl = "https://api.tibber.com/v1-beta/gql";

require('array.prototype.flatmap').shim();
var returnCommands = [];
var responsedata = "no data";
var acceptablePriceLevels = ["CHEAP","VERY_CHEAP","NORMAL"]; 
exports.handler = async (event, context) => {
    //var pricequery = '{ viewer { homes { currentSubscription { priceInfo{ today{ energy startsAt level } tomorrow{ energy startsAt level } current { energy startsAt level } } } } } }';
    var pricequery = '{ viewer { homes { currentSubscription { priceInfo{ current { energy startsAt level } } } } } }';
    let worthBuying = false;
    const headers = {
        Authorization: 'Bearer Mjl7mTBUzFZhFwLDA9JP0mhnMVo2tk6R9uBTG3IVntA',
        "Content-Type": 'application/json'
      };
    await request(tibberUrl, pricequery, undefined, headers).then((data) => {
        console.log(JSON.stringify(data));
        if (acceptablePriceLevels.includes(data.viewer.homes[0].currentSubscription.priceInfo.current.level)){
            worthBuying = true;
        }
        console.log("worth buying: "+worthBuying+" because of price level: "+data.viewer.homes[0].currentSubscription.priceInfo.current.level);
        responsedata = JSON.stringify(data);
    }).catch((error) => {
        console.error('Error fetching data:', error);
        responsedata = error;
      });

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
        if (worthBuying){
            returnCommands.push({command: "heater", value: "on"});
            returnCommands.push({command: "fan", value: "on"});
            console.log("Worth buying, turning on heater and fan.");
        }
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

//remove double commands and and set returnCommands to the correct order
//also make sure that if both on and off exists as values for the same command use the one in the prioritizedValues array

function filterCommands(commands){
    var prioritizedValues = [{command: "heater", value: "off"}, {command: "fan", value: "on"}, {command: "pump", value: "on"}];
    var filteredCommands = [];
    var foundCommands = [];
    var counts = commands.reduce((c, { command: key }) => (c[key] = (c[key] || 0) + 1, c), {});
    Object.keys(counts).forEach(key => {
        if (counts[key]<2) delete counts[key];
      });
    var comArr = Object.keys(counts);
    var compObj = {};
    for (const command of commands){
        if (comArr.includes(command.command)){
            if (compObj[command.command]==command.value){
                compObj[command.command] = command.value;
            }else{
                compObj[command.command] = prioritizedValues.find(x => x.command == command.command).value;
                
            }
        }
    }
    for (const command of commands){
        var dont = false;
        if (comArr.includes(command.command)){
            if (command.value == prioritizedValues.find(x => x.command == command.command).value){
                filteredCommands.push(command);
            }else{
                continue;
            }
        }else{
            filteredCommands.push(command);
        }
    }
    returnCommands = filteredCommands;
    return returnCommands;
}

//function that will get the electric prices from tibber
function getPrices(){
    var extbody;
}