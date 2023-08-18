exports.handler = async (event, context) => {
    const data = event.body;
    return {
        statusCode: 200,
        body: JSON.stringify({ message: "Pong!" })
    };
}