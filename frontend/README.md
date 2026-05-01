# frontend

The AGOS frontend is a Vite + React application providing interfaces for market research, portfolio management, and autonomous agent workflows.

## Visual Language

The design follows a strict brutalist/xAI aesthetic defined in `DESIGN.md`:
- **Theme**: Dark background (`#1f2228`) and pure white text.
- **Typography**: `GeistMono` for display/buttons and `universalSans` for body text.
- **Styling**: Sharp corners (0px radius), no box shadows, and no gradients.
- **Tailwind**: Uses Tailwind CSS v4. Theme tokens are defined in `src/index.css` under `@theme`.

## Local Development

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

The frontend expects the backend at `http://localhost:8000` and the engine at `http://localhost:5000`.

### Dev Bypass

To bypass Firebase authentication during local development, set the following environment variable in `.env`:

```env
VITE_ENABLE_DEV_BYPASS=true
```

## Verification

Run linting and build checks before pushing changes:

```bash
npm run lint
npm run build
```
