# Receipt font

`chinese.ttf` is Noto Sans SC at weight 400, derived from the Google Fonts
variable TrueType font under the SIL Open Font License in `FONT-LICENSE.txt`.
The static TrueType font and maintained `fontkit` subset encoder preserve
glyph outlines during PDF-to-JPEG rendering. The previous subset encoder
produced missing or malformed glyphs.

Source: https://github.com/google/fonts/blob/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf

Source SHA-256: `a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da`

Generated with FontTools 4.61.1 (build-time tool only):

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
font = TTFont('NotoSansSC-variable.ttf')
instantiateVariableFont(font, {'wght': 400}, inplace=True)
font.save('chinese.ttf')
```

Runtime embeds only the glyphs needed by each receipt, keeping PDF files small.
