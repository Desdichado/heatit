const { ElasticClient } = require('@elastic/elasticsearch')

exports.handler = async (event, context) => {
    const elasticClient = new ElasticClient({
        node: 'https://9581bdf4cb5d4b4b9bc1482b84ee70d6.eu-central-1.aws.cloud.es.io',
        auth: {
            apiKey: { // API key ID and secret
                id: 'elastic',
                api_key: 'pvskHbs7Hg6FntlurwDwYi6o',
              }
        }
    });
    const data = event.body;
        // Validate the data structure
        if (!Array.isArray(data)) {
            return res.status(400).json({ message: "Data should be an array of sensor readings" });
        }
    
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
        fs.appendFileSync(DATA_FILE, bulkData.join('\n'));
    
        // Forward data to Elasticsearch
        const operations = bulkData.flatMap(doc => [{ index: { _index: 'sandbatteri-stream-dev' } }, doc])

        const bulkResponse = await elasticClient.bulk({ refresh: true, operations })
      
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
      
        const count = await elasticClient.count({ index: 'tweets' })
        console.log(count)
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
        body: count
    };
