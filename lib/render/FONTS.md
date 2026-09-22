# Renderer fonts

The typefaces a brand kit can choose, bundled so a render looks the same on
every machine that runs the worker. libass is pointed at this directory with
`fontsdir`, so nothing here depends on what the host has installed.

Regular and Bold of each, as static TrueType from Google Fonts:

- Inter, Roboto, Open Sans, Montserrat, Poppins, Playfair Display

Inter, Open Sans, Montserrat, Poppins and Playfair Display are under the SIL
Open Font License 1.1. Roboto is under the Apache License 2.0. Both permit
bundling and redistribution with software.

Only font files live in `lib/render/fonts/`: libass loads every file in the
directory and complains about anything that is not a font.

The list of families lives in `lib/brand.ts` (`BRAND_FONTS`); the two must
agree, and the brand test checks that they do.
