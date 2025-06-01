import pinoHttp from "pino-http";

const pinoLogger = pinoHttp({
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    serializers: {
        req(req) {
            return { method: req.method, url: req.url, contentType: req.headers['content-type'] };
        },
        res(res) {
            return { statusCode: res.statusCode };
        }
    },
    customSuccessMessage: (req, res) => `Handled ${req.method} ${req.url} - ${res.statusCode}`,
    customErrorMessage: (req, _res, err) => `Error in ${req.method} ${req.url} - ${err.message}`,
    customLogLevel: (_req, res, err) => {
        if(err || res.statusCode >= 500) {
            return "error"
        }
        else if(res.statusCode >= 400) {
            return "warn"
        }
        else {
            return "info"
        }
    }
});

export { pinoLogger }