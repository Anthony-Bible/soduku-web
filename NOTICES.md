# Third-party notices

## Lettergrid Word List (SCOWL / ESDB)

`public/lettergrid/wordlist-v1.txt` is derived from the English Speller Database (ESDB, previously SCOWL, Spell Checker Oriented Word Lists) by Kevin Atkinson, https://wordlist.aspell.net.

- Source: custom word lists generated at https://app.aspell.net/create, ESDB git revision `1e5b7d3` (Wed Jun 24 2026), app revision `156fb4e`. Size 60 (the Word List) and size 35 (limits Seed Word candidates), spelling US and GB (-ise and -ize), diacritics stripped.
- Only lowercase a-z words of 2 to 9 letters are kept, which drops proper nouns, initialisms and possessives. Abbreviations are removed at the source: every lowercase word that ESDB's `data/scowl-pre.txt` tags `abbr` and has no ordinary entry for (at size 60 or below) is dropped (`extractAbbreviations` in `src/core/lettergrid/filter.ts`), plus any vowelless leftover not on a short allow-list.
- Seed Word candidates are limited to words also in the size-35 export (common words), so the opening word is familiar (CONTEXT.md, Seed Word), and are never blocked words (see below).
- Input SHA-256: size-60 export `dbb15953f75c68035c978776249fb20961db460534d4e121598a5476253ee2ec`, size-35 export `54f91df4e763f0fd738f997632ad612582f819717294cf459ae13ba8d4df1e20`, `scowl-pre.txt` `a5fe3f11682a6ab9d31f2ea2a185833b1a01be7af83409c671bd0756a870f6c7` (also in the artifact's header line).

Licence text from the source (the whole notice above `===` in ESDB's `Copyright` file; no other ESDB copyright applies to a size 60 word list):

> Copyright 2000-2026 by Kevin Atkinson
>
> Permission to use, copy, modify, distribute, and sell any part of the English Speller Database (ESDB, previously known as SCOWLv2), or word lists created from it, is hereby granted without fee, provided that the above copyright notice appears in all copies and that both the above copyright notice and this notice appear in supporting documentation.  Kevin Atkinson makes no representations about the suitability of this database for any purpose.  It is provided "as is" without express or implied warranty.
>
> ESDB is derived from many sources, most of which are in the Public Domain. Data from the Corpus of Contemporary American English (COCA) was also used.
>
> All data from COCA comes from 3-gram data that is not freely available; however, the usage is within the rights given by the NDA that was signed when purchasing the data.  More information on COCA is available at https://www.english-corpora.org/coca/.
>
> The primary source of words for ESDB comes from 12dicts and ENABLE2K.  Both are in the Public Domain, but Alan Beale <biljir@pobox.com> deserves special credit as he is the author of 12dicts and a major contributor to ENABLE2K.  In addition, he gave me an incredible amount of feedback and created a number of special lists in order to help improve the overall quality of ESDB.

## Lettergrid Seed Word blocklist (LDNOOBW)

`src/core/lettergrid/blocklist.ts` blocks Seed Words using the single words from the English list of "List of Dirty, Naughty, Obscene, and Otherwise Bad Words" (LDNOOBW), https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words, through the `naughty-words` npm package version 1.2.0. It is used only at build and test time and is not shipped in the app.

Copyright Shutterstock, Inc. and the LDNOOBW contributors. Licensed under the Creative Commons Attribution 4.0 International License (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/. We use only the single lowercase words, unioned with our own list. The list is not otherwise modified.
