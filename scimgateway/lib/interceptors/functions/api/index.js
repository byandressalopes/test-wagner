const { formatAuth } = require("../../../utils/formatAuth");
const { formatURL } = require("../../../utils/formatURL");
const axios = require("axios");

let api;
try {
  api = require("@opentelemetry/api");
} catch (err) {}

async function fetchApi(ctx, request) {
  const activeSpan = api?.trace.getSpan(api?.context.active());
  activeSpan?.addEvent("Interceptor: Fetch to API");

  const port = ctx.request.header.host.split(":")[1];
  let formattedURL = formatURL(ctx.request.body, request.url);

  let formattedAuth = (
    await formatAuth(request.auth, `http://localhost:${port}`)
  ).token;

  const headers = {
    Authorization: formattedAuth,
    ...(request.headers || {}),
  };

  const response = await axios
    .request({
      url: formattedURL,
      method: request.method,
      headers,
      data: request.body,
    })
    .then((res) => res.data)
    .catch((err) => {
      console.log(err);
    });

  let responseAttrs = {};
  request.mapping.forEach((item) => {
    responseAttrs[item.mapTo] = response[item.name];
  });

  ctx.request.body = { ...ctx.request.body, ...responseAttrs };
}

module.exports = { fetchApi };
