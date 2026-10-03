# Contributing

Pull requests are welcome.

- Fork the repo and open a PR against `main`.
- CI runs `claude plugin validate . --strict` and `claude plugin test .`; both must pass.
- Add or update a test in `tests/md-render.test.ts` for any behavior change.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, ...).
- Sign off every commit (`git commit -s`) to certify the [Developer Certificate of Origin](https://developercertificate.org/).

Colors and the style mapping live in `CONFIG` at the top of `hooks/register.tsx`.
