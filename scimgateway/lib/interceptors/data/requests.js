const requests = [{
  "port": "37883",
  "method": "GET",
  "allowed_requests": [
    {
      "path": "users",
      "method": "POST"
    }
  ],
  "mapping": [],
  "auth": {
    "type": "none"
  },
  "position": 0
}];
            
module.exports = { requests };