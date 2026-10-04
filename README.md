# Krestiki — Cross-stitch Tracker

English · [Русский](README.ru.md)

An offline calendar for counting cross-stitches, not a tic-tac-toe game.
Enter a day's stitch count to see monthly and yearly totals and your average across the whole year.
Unfilled days count as zero, so the average reflects consistency as well as productive days.

## Run

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. The static files also work on GitHub Pages.
On iPhone or iPad, open the HTTPS page in Safari and add it to the home screen.
The interface is Russian.

## Features and limits

- Calendar, daily chart and an optional split view on wide landscape screens.
- JSON export and import; data is stored locally in the browser.
- Local fonts and icons; no account, server or analytics calls in the app.
- The current calendar supports 2025 and 2026. Other years require a source change.

Export before clearing site data or changing browsers. This is a small personal tracker, not a complete craft-project manager.

## Origin

A standalone tool built around daily embroidery progress. No upstream GitHub project was identified.
Bundled DejaVu Sans fonts retain their separate license in `assets/fonts/LICENSE.txt`.

## License

Own source: MIT.
Bundled DejaVu fonts keep their separate [license](assets/fonts/LICENSE.txt).
