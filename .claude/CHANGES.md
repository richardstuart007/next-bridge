# Changes — next-bridge, "version": "0.1.0"

## package.json
- Removed `clsx` from dependencies — was listed but never imported anywhere in src/

## Reinstall
- Full reinstall after nextjs-shared update: removed node_modules, package-lock.json, .next; ran npm install --legacy-peer-deps and npm run build
