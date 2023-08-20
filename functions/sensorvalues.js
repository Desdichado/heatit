const { Client } = require('@elastic/elasticsearch')
require('array.prototype.flatmap').shim();
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
    /*    // Validate the data structure
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
    */
        const bulkData = [];
        for (const entry of data) {
            bulkData.push(JSON.stringify({
                "@timestamp": new Date().toISOString(),
                "sensorValue": entry.sensorValue,
                "sensorType": entry.sensorType,
                "sensorId": entry.sensorId
            }));
        }
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
      
        const count = await client.count({ index: 'sandbatteri-stream-dev' })
        console.log(count)
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': '*',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Credentials': 'true'
            },
            body: "{count: " + count.count + "}"
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
