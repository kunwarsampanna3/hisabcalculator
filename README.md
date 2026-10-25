# हिसाब · Hisab Calculator

A printing-style calculator built with plain HTML, CSS and JavaScript — no frameworks, no `eval()`.

## Features

- **Paper tape** — every answer prints to a receipt roll; tap a line to reuse its total. Saved in `localStorage`.
- **Nepali digits** — switch the whole calculator between `123` and `१२३` (you can also type Devanagari digits on the keyboard).
- **Lakh / Million grouping** — `1,23,45,678` or `12,345,678`.
- **Amount in words** — "one crore twenty-three lakh forty-five thousand six hundred seventy-eight".
- **+VAT 13% key** — Nepal's VAT rate in one tap; the tape shows taxable amount, VAT and total.
- **Shop-style percent** — `200 + 10% = 220`, `200 − 15% = 170`, `200 × 15% = 30`.
- **Real expression parser** — brackets, operator precedence, unary minus, ± key, floating-point noise cleanup (`0.1 + 0.2 = 0.3`).
- **Keyboard support** — `0–9 + − * / ( ) % . Enter Backspace Esc`, `v` for VAT.
- Click the display to copy the result. Light and dark themes follow your system.

## Run

Just open `index.html` in a browser. No build step.

## Files

| File | What it does |
|---|---|
| `index.html` | Markup: calculator body, keypad, paper tape |
| `style.css` | Theme tokens (light/dark), hardware-style keys, torn-paper tape |
| `script.js` | Input logic, shunting-yard parser, formatting, words, tape |
