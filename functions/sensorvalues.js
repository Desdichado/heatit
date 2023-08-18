const { Client } = require('@elastic/elasticsearch')

exports.handler = async (event, context) => {
    const client = new Client({
        node: 'https://9581bdf4cb5d4b4b9bc1482b84ee70d6.eu-central-1.aws.cloud.es.io',
        auth: {
            apiKey: { // API key ID and secret
                id: 'elastic',
                api_key: 'pvskHbs7Hg6FntlurwDwYi6o',
              }
        }
    });
    const data = event.body;
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Credentials': 'true'
        },
        body: event.body
    };
}