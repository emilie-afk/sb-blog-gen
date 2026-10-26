// A local stand-in for the Netlify Blobs edge HTTP API, so the REAL
// @netlify/blobs client (connectLambda, getStore, set with onlyIfNew, get,
// list, delete) can be exercised end to end without the platform.
//
// What it implements, as the client calls it with an edgeURL:
//   PUT    /<site>/<store>/<key>   write; with `If-None-Match: *` the existence
//                                  check and the write happen in one
//                                  synchronous step, and an existing key gets
//                                  412, which is the contract the service
//                                  documents for onlyIfNew.
//   GET    /<site>/<store>/<key>   200 with the body, or 404
//   GET    /<site>/<store>?prefix  JSON listing { blobs: [{ key, etag }], directories: [] }
//   DELETE /<site>/<store>/<key>   204
// Every request must carry `Authorization: Bearer <token>`.
//
// Faults can be injected per method to check that errors surface instead of
// being mistaken for success.

const http = require('http');

function startFakeBlobsEdge({ siteID = 'site-id', token = 'blob-token', stores: given, fault: givenFault } = {}) {
  const stores = given || new Map();
  const storeMap = name => { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name); };
  const requests = [];   // cleared by tests between sections
  const history = [];    // never cleared
  // fault: { put, conditionalPut, get, list }: an HTTP status to answer with.
  const fault = givenFault || {};
  let etagSeq = 0;

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://edge');
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      const [site, storeName, ...keyParts] = parts;
      const key = keyParts.join('/');
      const method = req.method.toLowerCase();
      const ifNoneMatch = req.headers['if-none-match'];
      const entry = { method, storeName, key, ifNoneMatch, prefix: url.searchParams.get('prefix') };
      requests.push(entry); history.push(entry);
      const send = (status, body, headers) => { res.writeHead(status, headers || {}); res.end(body); };

      if (req.headers.authorization !== `Bearer ${token}` || site !== siteID) return send(401, 'unauthorized');
      const map = storeMap(storeName);

      if (method === 'put') {
        const conditional = ifNoneMatch === '*';
        if (conditional && fault.conditionalPut) return send(fault.conditionalPut, 'fault');
        if (!conditional && fault.put) return send(fault.put, 'fault');
        // Check and write in one synchronous step: no other request can run
        // in between on this single-threaded server.
        if (conditional && map.has(key)) return send(412, '');
        map.set(key, Buffer.concat(chunks).toString('utf8'));
        return send(200, '', { etag: `"e${++etagSeq}"` });
      }
      if (method === 'get' && key) {
        if (fault.get) return send(fault.get, 'fault');
        if (!map.has(key)) return send(404, '');
        return send(200, map.get(key), { 'content-type': 'text/plain', etag: '"x"' });
      }
      if (method === 'get') {
        if (fault.list) return send(fault.list, 'fault');
        const prefix = url.searchParams.get('prefix') || '';
        const blobs = [...map.keys()].filter(k => k.startsWith(prefix)).map(k => ({ key: k, etag: '"x"' }));
        return send(200, JSON.stringify({ blobs, directories: [] }), { 'content-type': 'application/json' });
      }
      if (method === 'delete') { map.delete(key); return send(204, ''); }
      return send(405, '');
    });
  });

  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}`;
    const blobsContext = Buffer.from(JSON.stringify({ url, token })).toString('base64');
    resolve({
      url, siteID, token, blobsContext, stores, storeMap, requests, history, fault,
      headers: { 'x-nf-site-id': siteID, 'x-nf-deploy-id': 'deploy-id' },
      close: () => new Promise(r => { server.closeAllConnections && server.closeAllConnections(); server.close(r); })
    });
  }));
}

module.exports = { startFakeBlobsEdge };
