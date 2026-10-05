# Gyors parancslista

A `/...` parancsokat játékbeli chatben add ki. A `<név>` helyére valódi játékosnevet írj; szóközös névnél használj idézőjelet. Az AdminTools saját keresője egyetlen egyértelmű célpontot vár. A SimpleAdmin/FunCommands támogatja a `#userid`, `@me`, `@all` célzásokat is.

| Mire kell | Parancs |
|---|---|
| Adminmenü | `/admin` |
| Részletes adminparancs-lista | `/adminhelp` |
| Csendes adminműveletek kapcsolása | `/hidecomms` |
| Láthatatlanság magadnak | `/invis` |
| Láthatatlanság másnak | `/invis <név>` |
| Wallhack magadnak / másnak | `/wh` / `/wh <név>` |
| Élet visszatöltésének kapcsolása | `/god` / `/god <név>` |
| HP magadnak / másnak | `/hp 200` / `/hp 200 <név>` |
| Sebesség magadnak / másnak | `/speed 1.5` / `/speed 1.5 <név>` |
| Pénz adása | `/money 16000 <név>` |
| Folyamatos pénzfeltöltés | `/infmoney` / `/infmoney <név>` |
| Aktív AdminTools képességek | `/status` |
| AdminTools képességek törlése mindenkinek | `/resetall` |
| Noclip kapcsolása | `/noclip @me` |
| Megállítás / feloldás | `/freeze <név>` / `/unfreeze <név>` |
| Újraélesztés | `/respawn <név>` |
| Gravitáció | `/gravity <név> 0.5` |
| Eredeti gravitáció | `/gravity <név> 1` |
| Méret | `/resize <név> 1.5` |
| Eredeti méret | `/resize <név> 1` |
| Fegyver adása / elvétele | `/give <név> ak47` / `/strip <név>` |
| Azonnali ölés | `/slay <név>` |
| HP levonása | `/slap 10 <név>` |
| Kirúgás | `/kick <név> <indok>` |
| Tiltás percben | `/ban <név> 60 <indok>` |
| Hang / chat tiltás | `/mute <név> 10 <indok>` / `/gag <név> 10 <indok>` |
| Hang / chat feloldás | `/unmute <név>` / `/ungag <név>` |
| Pályaváltás | `/map de_dust2` |
| Meccs újrakezdése | `/restart` vagy `/rr` |
| Csak a kör újraindítása | `/restartround` |
| Odaugrás / odahozás | `/goto <név>` / `/bring <név>` |

A `/invis` közben normál futásnál fél másodperc alatt fokozatosan jelensz meg, megálláskor visszahalványulsz. A csendes Shift-mozgás és guggolás önmagában nem fed fel. Lövés és más hangos esemény azonnal felfed; a jelző a karakter láthatóságát követi.

A `/god` a pluginban életet tölt vissza minden szerverticken. Egyetlen halálos találat elleni védelmet a helyi ellenőrzés nem igazol; ezt külön kell kipróbálni. Ha egy parancsnál bizonytalan a célzás, használd a menüt.

## Gyakorlás

Először az adminmenüben válaszd a gyakorló módot, vagy add ki a `!prac` parancsot. Ezt a módot a MatchZy kezeli. Utána:

| Mire kell | Parancs |
|---|---|
| Állapot lekérdezése | `!mode` |
| CS2-játékmód menüje (admin) | `!gamemode` vagy `!gamemodes` |
| Forgatási mód kiválasztása | `!filming` |
| Gyakorlás kikapcsolása, normál profil | `!normal` |
| Saját pozíció mentése / visszatöltése | `!savepos` / `!loadpos` |
| Gránátpozíció mentése / visszatöltése | `!savenade smoke_A1` / `!loadnade smoke_A1` |
| Gránátmentések listája / törlése | `!listnades` / `!deletenade smoke_A1` |
| Bot a helyedre / guggoló bot | `!bot` / `!cbot` |
| Gyakorlóbotok törlése | `!nobots` |
| Vissza az utolsó gránát helyére | `!last` |
| Utolsó gránát újradobása | `!rethrow` |
| Noclip | `/noclip @me` |

A régi PracticeMod pozíciómentései az inaktív pluginmappával megmaradtak; nem kerültek automatikusan a MatchZybe. Az új gránátmentések a MatchZy saját adatbázisában vannak. Költözéskor a teljes MatchZy pluginmappát, a `cfg/MatchZy` mappát és a `game/csgo/MatchZy` demó-/backupmappát is mentsd.

## Meccsek és workshop-pályák

| Mire kell | Parancs |
|---|---|
| Meccsmód és bemelegítés (admin) | `!match` |
| Készen állok / még nem (játékos) | `!ready` / `!unready` |
| Indítás (admin) | `!start` |
| Meccs újrakezdése / lezárása (admin) | `!restart` / `!endmatch` |
| Késkör kapcsolása (admin) | `!roundknife` |
| Késkör után maradás / oldalcsere | `!stay` / `!switch` |
| Adminszünet / folytatás | `!forcepause` / `!forceunpause` |
| Csapatszünet / közös folytatás | `!pause` / `!unpause` |
| Korábbi kör visszaállítása (admin) | `!restore 5` |
| Hagyományos pálya (admin) | `!map de_mirage` |
| Workshop-pálya linkkel (admin) | `!map https://steamcommunity.com/sharedfiles/filedetails/?id=3070244462` |
| Workshop-pálya azonosítóval (admin) | `!map 3070244462` |

A `!map` aktív meccs esetén előbb lezárja a meccset. Workshop-linknél a szerver `host_workshop_map <ID>` parancsot futtat; a pályának CS2-höz készült, elérhető workshop-elemnek kell lennie. Az első letöltés késleltetheti a váltást. Pályaváltáskor a kiválasztott szervermód megmarad. Normál/forgatási/gyakorló módba aktív meccsből előbb `!endmatch` után válts.

Alapból minden csatlakozott játékosnak `!ready` kell; a késkör és az automatikus helyi demórögzítés bekapcsolva. Külső demófeltöltés nincs beállítva. A `!stop` kör-visszaállítás nincs engedélyezve; az admin `!restore` használható.

## CS2-játékmódok és adminmenü

A `!gamemode` és `!gamemodes` megnyitja a játékmódválasztót. A telepített MenuManager a beállított menütípust használja; alapból WASD menü nyílik. Alapbillentyűk: **W/S** fel/le, **A/D** lapozás, **E** kiválasztás, **R** bezárás, **Ctrl** vissza. Nyitott billentyűs menü alatt a karakter mozgása szünetel. A `!menus` paranccsal választhatsz másik menütípust. Ha a MenuManager nem elérhető, számozott chatmenü nyílik, amelyet a `!1`, `!2` stb. választásokkal kezelhetsz. A menüben való választás **normál profilra vált és újratölti a pályát**. A `!admin` menüből is elérhető a játékmódválasztó.

Közvetlen használat: `!gamemode <mód> [pályanév|workshop-azonosító|Steam-workshop-link]`. Szerverkonzolban például `css_gamemode wingman` vagy `css_gamemode custom 3070244462`. Jogosultság: `@css/root`, `@css/changemap` vagy a MatchZy korábbi `@css/map` adminjoga; a szerver parancsfelülírásai ezt tovább szűkíthetik. Betöltött vagy aktív MatchZy-meccsnél előbb `!endmatch` kell. A nyitott menüben történő választáskor újra ellenőrzi a jogosultságot és a meccs állapotát.

| Játékmód | Parancs | Automatikus pályaválasztás |
|---|---|---|
| Competitive 5v5 | `!gamemode competitive` | A jelenlegi `de_`/`cs_` pálya; más pályáról Dust II |
| Wingman 2v2 | `!gamemode wingman` | A jelenlegi ismert Wingman-pálya; egyébként Nuke |
| Casual | `!gamemode casual` | A jelenlegi `de_`/`cs_` pálya; más pályáról Dust II |
| Deathmatch, mindenki mindenki ellen | `!gamemode deathmatch` | A jelenlegi `de_`/`cs_` pálya; más pályáról Dust II |
| Team Deathmatch, közös csapatpontszám | `!gamemode teamdeathmatch` | A jelenlegi `de_`/`cs_` pálya; más pályáról Dust II |
| Arms Race | `!gamemode armsrace` | A jelenlegi ismert Arms Race-pálya; egyébként Baggage |
| Retakes, 4v3 bombalerakás után | `!gamemode retakes` | A jelenlegi ismert két bombás pálya; egyébként Dust II |
| Rush 3v3 | `!gamemode rush` | `rush_001` |
| Valve új játékosoknak szánt training módja | `!gamemode training` | Dust II |
| Custom / Workshop | `!gamemode custom` | A jelenlegi pálya |

Rövidítések: `comp`, `5v5`, `premier` → competitive; `2v2` → wingman; `dm`, `ffa` → deathmatch; `tdm` → teamdeathmatch; `ar`, `gg` → armsrace; `retake` → retakes; `3v3` → rush; `tutorial` → training; `workshop` → custom. A `premier` helyi competitive szabályokat jelent; Valve-ranglistát nem ad.

Másik pálya vagy link megadható ugyanabban a parancsban, például `!gamemode wingman de_inferno`, `!gamemode armsrace ar_shoots` vagy `!gamemode custom https://steamcommunity.com/sharedfiles/filedetails/?id=3070244462`. Kézzel megadott pályánál az admin feladata ellenőrizni, hogy a pálya támogatja-e a kiválasztott módot. A Workshop-pályának CS2-höz készült, elérhető elemnek kell lennie; az első letöltés lassíthatja a váltást. A natív Custom mód a pálya és a saját beállításai szerinti játékszabályokat használja.

A normál profil a többi natív módban továbbra sem tölt fel automatikusan botokkal. A Valve training módja kivétel: a saját Dust II oktatóbotjait és automatikus csatlakozását használja. Forgatási vagy MatchZy gyakorló profilban a helyi botkezelési beállítások érvényesek.

A `!normal`, `!filming`, `!prac` **profilok**: a pénzt, újraéledést, gyakorlást és forgatási beállításokat szabályozzák. A kiválasztott **CS2-játékmódot** megtartják; például `!gamemode wingman`, majd `!filming` Wingman pályát forgatási profillal használ. `!normal` visszatölti az adott natív mód szabályait. A `!mode` mindkettőt kiírja. A Valve `training` módja külön választás a MatchZy `!prac` gyakorlásától.

MatchZy-meccs a competitive és Wingman módokon indítható: `!gamemode wingman`, majd `!match`. Wingman esetén kétfős csapatbeállításokat és a `live_wingman.cfg` szabályait használja: 16 rendes kör, 8000 maximális pénz, négykörös hosszabbítás. Alapból továbbra is az összes csatlakozott játékos készenlétét várja; admin `!start` paranccsal indíthat. Más natív módban a `!match` útmutatást ad a competitive/Wingman választásához.

A választott játékmód és a normal/filming/practice profil a MatchZy pluginmappájában lévő `local-server-mode.json` fájlban megmarad pályaváltás, pluginújratöltés és szerverújraindítás után. Újraindításkor, ha a szerver más natív móddal indult, a mentett módhoz megfelelő pályát újratölti. Ha pluginújratöltéskor a natív mód már egyezik, nem vált pályát; eltérésnél megtartja a futó pálya natív módját. Az aktív MatchZy-meccs és a gyakorlóbotok élő állapota ezzel a fájllal nem áll vissza. A fájlt költözéskor is mentsd.

A módlista a Valve aktuális játékmód-fájljaira és közleményeire épül: a [Retakes 2025. október 22-én visszatért](https://store.steampowered.com/news/posts/?appids=730&enddate=1763082075&feed=steam_community_announcements), a [Rush 2026. szeptember 22-én jelent meg](https://www.counter-strike.net/news/CS2?l=ukrainian). A korábbi Danger Zone, Guardian, Co-op és Demolition módok nincsenek a menüben. Az elérhető pályákhoz és a módazonosítókhoz a [Valve aktuális `gamemodes.txt` fájljának másolata](https://github.com/SteamTracking/GameTracking-CS2/blob/master/game/csgo/pak01_dir/gamemodes.txt) szolgált forrásként. Ellenőrizve: 2026. október 3.

## Ütközések elkerülése

A közös parancsoknak egy szolgáltatója van. Az AdminTools kezeli a `god`, `hp`, `speed`, `money`, `slay`, `slap`, `rcon` parancsokat. A SimpleAdmin slay/slap/rcon változata `sa_slay`, `sa_slap`, `sa_rcon`; saját pályaváltása `adminmap`/`changemap`, körújraindítása `restartround`, kilépettjátékos-listája `lastplayers`. A MatchZy a `map`, `restart`, `rr`, `last` parancsokat kezeli, saját map-vetó tiltása `vetoban`, adminüzenete `mzasay`, konzolparancsa `mzrcon`, gyakorló god módja `pracgod`. A normál `ban`, `asay` és `god` adminművelet megmaradt.

A szerverkonzolban a chatparancsok többségénél a `css_` előtagot kell használni. Az AdminTools legtöbb képességparancsa játékoshoz kötött. A módváltáshoz az adminmenü, `css_filming`, `css_prac`, `css_normal`, `css_match` vagy a megfelelő `exec cs2/*.cfg` használható. Az `!` és `/` előtag egyaránt működik; a `/` csendes chatparancs.
