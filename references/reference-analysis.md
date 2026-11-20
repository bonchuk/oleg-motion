# Breaking down a reference ("make it like this")

A reference shows the rhythm the person wants better than any answer. Copy how it moves,
never its content, brand or assets.

## Get the frames
```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 ref.mp4            # length
ffmpeg -v error -i ref.mp4 -vf "fps=4,scale=320:-1,tile=6x4" -frames:v 1 sheet-%02d.jpg   # 6 s per sheet
ffmpeg -v error -ss 1.5 -i ref.mp4 -frames:v 1 frame.png                       # any single moment
```
Look at the sheets in order; open single frames where something changes. A still image or a
screenshot as reference works too — then only the look (light, particles, palette) is copied.

## Fill this in (short), then plan
- **Format / length / loop or not:** e.g. 4:5, 6 s, seamless loop after a 1.5 s intro.
- **Entrance order and timing:** what appears first, gaps between elements, how (rise, pop, wipe).
- **Hero:** the one element that carries the motion, and what it does.
- **Ambient:** background motion, particles, light — what and how much.
- **Rhythm:** how often something noticeable happens (every 2 s? every loop?).
- **Palette of the effects:** which colours the added light/particles use.
- **Why it works (one line)** and **the trick to reuse (one line).**

Then map it onto the new image: same order and rhythm, effects from references/effects.md,
colours from the new image or its brand kit. Say in the motion plan which parts follow the
reference and which differ because the new image is different.
