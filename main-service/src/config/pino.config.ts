import pinoHttp from "pino-http";

const pinoLogger = pinoHttp({
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    serializers: {
        req(req) {
            return { method: req.method, url: req.url };
        },
        res(res) {
            return { statusCode: res.statusCode };
        }
    },
    customSuccessMessage: (req, res) => `Handled ${req.method} ${req.url} - ${res.statusCode}`,
    customErrorMessage: (req, _res, err) => `Error in ${req.method} ${req.url} - ${err.message}`
});

export { pinoLogger }