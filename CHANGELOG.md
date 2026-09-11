# Changelog

## 0.2.0
- Added tools for image endpoints (fetch by id, fetch by product, create, replace via base64, generic update via base64, import by URL).

## 0.1.0
- Initial release: product endpoints (list, search, fetch by id, batch details, filtered search, update, delete).
- Automatic JWT login with token caching and renewal (expiry check + 401 retry).
- Optional static-token fallback via `API_TOKEN`.
