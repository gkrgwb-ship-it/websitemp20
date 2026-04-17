const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_FILE = path.join(ROOT, "data", "site-data.json");
const INQUIRIES_FILE = path.join(ROOT, "data", "inquiries.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function safeJoin(basePath, requestedPath) {
  const targetPath = path.normalize(path.join(basePath, requestedPath));
  if (!targetPath.startsWith(basePath)) {
    return null;
  }
  return targetPath;
}

function validateInquiry(body) {
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const message = String(body.message || "").trim();

  if (name.length < 2) {
    return "Name must be at least 2 characters.";
  }

  if (phone.length < 10) {
    return "Phone must be at least 10 digits.";
  }

  if (message.length < 10) {
    return "Message must be at least 10 characters.";
  }

  return null;
}

function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/site-data") {
    const siteData = readJson(DATA_FILE, {});
    return sendJson(res, 200, siteData);
  }

  if (req.method === "POST" && pathname === "/api/inquiries") {
    let rawBody = "";

    req.on("data", (chunk) => {
      rawBody += chunk;
      if (rawBody.length > 1_000_000) {
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        const body = JSON.parse(rawBody || "{}");
        const errorMessage = validateInquiry(body);

        if (errorMessage) {
          return sendJson(res, 400, { ok: false, error: errorMessage });
        }

        const inquiries = readJson(INQUIRIES_FILE, []);
        inquiries.push({
          id: Date.now(),
          name: String(body.name).trim(),
          phone: String(body.phone).trim(),
          message: String(body.message).trim(),
          createdAt: new Date().toISOString()
        });
        writeJson(INQUIRIES_FILE, inquiries);

        return sendJson(res, 201, {
          ok: true,
          message: "Thanks. Your enquiry has been saved."
        });
      } catch (error) {
        return sendJson(res, 400, {
          ok: false,
          error: "Invalid JSON request body."
        });
      }
    });

    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found." });
}

function handleStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = safeJoin(PUBLIC_DIR, requestedPath);

  if (!filePath) {
    return sendText(res, 403, "Forbidden");
  }

  fs.readFile(filePath, (error, fileBuffer) => {
    if (error) {
      if (error.code === "ENOENT") {
        const indexPath = path.join(PUBLIC_DIR, "index.html");
        fs.readFile(indexPath, (indexError, indexBuffer) => {
          if (indexError) {
            return sendText(res, 500, "Server error");
          }

          res.writeHead(200, {
            "Content-Type": MIME_TYPES[".html"],
            "Cache-Control": "no-cache"
          });
          res.end(indexBuffer);
        });
        return;
      }

      return sendText(res, 500, "Server error");
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=86400"
    });
    res.end(fileBuffer);
  });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname.startsWith("/api/")) {
    handleApi(req, res, pathname);
    return;
  }

  handleStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`MP20 site running at http://localhost:${PORT}`);
});
