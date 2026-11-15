// Last Express handler: 4xx keep their message, 5xx answer "internal error" and log one JSON line
// (no query string: it can carry polygons and other user input; no stack).
export function errorHandler(err, req, res, _next) {
  const status = err?.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) {
    console.error(JSON.stringify({
      level: "error",
      method: req.method,
      path: req.path,
      status,
      message: err?.message ?? String(err),
      code: err?.code ?? null, // pg SQLSTATE, e.g. 42P01 = missing table/view
    }));
  }
  res.status(status).json({ error: status < 500 ? err.message : "internal error" });
}
