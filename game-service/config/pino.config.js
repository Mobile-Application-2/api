import pinoHttp from "pino-http";

const pinoLogger = pinoHttp({
    serializers: {
        req(req) {
            return { method: req.method, url: req.url };
        },
        res(res) {
            return { statusCode: res.statusCode };
        }
    },
    customSuccessMessage: (req, res) => `Handled ${req.method} ${req.url} - ${res.statusCode}`,
    customErrorMessage: (req, res, err) => `Error in ${req.method} ${req.url} - ${err.message}`
});

export { pinoLogger }