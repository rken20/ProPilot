# Stand-in house for the home page

The frames in `public/hero-seq/v1` were rendered from `scene.html` (a small three.js scene of a
house building itself) until the owner's own clip replaces them.

To render again: in an empty folder, `npm i three@0.170 playwright`, copy these two files in,
run `node render.js png 121`, then `../hero-frames.sh "png/%03d.png" v1 121 1000:900:300:0`
from this folder's parent.
