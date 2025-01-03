const { rules } = require("./data/rules");
const { requests } = require("./data/requests");
const { requestsWithRules } = require("./data/requestsWithRules");

const { verifyRules } = require("./functions/rules");
const { fetchApi } = require("./functions/api");
const { fetchApiWithRule } = require("./functions/requestsWithRules");
const { getCacheInfo } = require("../utils/getCacheInfo");
const processExtConfig = require("../utils/processExtConfig");

function verifyAllowedRequests(allowedRequests, method, path) {
  return allowedRequests.some(
    (item) => item.method === method && item.path === path
  );
}

async function fetchInterceptors(ctx, caches, verifyTracing) {
  const port = ctx.request.header.host.split(":")[1];

  const interceptors = [
    ...(requests?.map((item) => ({ ...item, interceptorType: "request" })) ||
      []),
    ...(rules?.map((item) => ({ ...item, interceptorType: "rule" })) || []),
    ...(requestsWithRules?.map((item) => ({
      ...item,
      interceptorType: "request-with-rule",
    })) || []),
  ]
    .filter(
      (item) =>
        item.port === port &&
        verifyAllowedRequests(
          item.allowed_requests,
          ctx.request.method,
          ctx.request.url.split("/")[1].toLowerCase()
        )
    )
    .sort((a, b) => a.position - b.position);

  for (const item of interceptors) {
    try {
      let newSpan = verifyTracing(
        ctx,
        `fetch interceptors - ${item.interceptorType}`
      );

      // getting cache info
      const formattedItem = await getCacheInfo(
        processExtConfig(item.interceptorType, item),
        caches,
        port
      );

      switch (item.interceptorType) {
        case "request":
          await fetchApi(ctx, formattedItem);
          break;
        case "rule":
          await verifyRules(ctx, formattedItem);
          break;
        case "request-with-rule":
          await fetchApiWithRule(ctx, formattedItem);
          break;
        default:
          break;
      }
      newSpan?.end();
    } catch (error) {
      let errorMessage = error.message;
      switch (item.interceptorType) {
        // case "request":
        //   errorMessage = `Request to ${item.url} failed`;
        //   break;
        case "rule":
          if (error.message.search("Undefined fact") >= 0) {
            errorMessage = `Missing one of required fields: ${item.conditions.map(
              (cd) => cd.fact
            )}`;
            return;
          }
          errorMessage = `${error.message} - rules verified: ${ctx.body?.rules}`;
          break;
        case "apiWithRule":
          errorMessage = `Error occurred in apiWithRule interceptor: ${error.message}`;
          break;
        default:
          break;
      }

      try {
        if (item.on_error) {
          function executeScript(obj) {
            eval?.(`"use strict";(${obj})`);
          }
          executeScript(item.on_error);
        }
      } catch (catchError) {
        console.log(`Error running on error script: ${catchError.message}`);
      }

      if (item.block_on_error !== undefined ? item.block_on_error : true) {
        ctx.status = 400;
        ctx.body = {
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail:
            item.errorMessage ||
            `Error while running interceptor (${item.interceptorType}): ${errorMessage}`,
          status: 400,
        };
        return false;
      }
    }
  }
  return true;
}

module.exports = { fetchInterceptors };
