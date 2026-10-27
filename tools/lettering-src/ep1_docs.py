# Pages bis de l'épisode 1 (EN) : texte dactylographié. y = ligne de base de la première ligne.
H = lambda t, y, size=27, **k: {"text": t, "y": y, "size": size, "underline": 26, **k}
P = lambda t, y, **k: {"para": t, "y": y, **k}
DOCS = {
"p02": {"rects": [[50, 1070, 1000, 1500]], "left": 70, "size": 20, "width": 870, "lh": 29, "lines": [
    H("WHO WAS DUSKO POPOV, REALLY?", 1105),
    P("Born in 1912 on the banks of the Danube, son of a wealthy Serbian family settled in Dubrovnik. Lawyer, doctor of law, polyglot, gambler, seducer. During the Second World War, he worked for two secret services at once. Which one was he really deceiving?", 1167),
    P("They say he inspired Ian Fleming’s James Bond. That he staked a fortune at baccarat, with someone else’s money. That his code name, “Tricycle”, owed more to his private life than to his talent as a spy. That he could have changed the course of the war, had anyone listened.", 1308),
    P("What is true, what is exaggerated: Monsieur X has his version.", 1481)]},
"p07": {"rects": [[60, 815, 1010, 1135]], "left": 80, "size": 22, "width": 880, "lh": 29, "lines": [
    H("YUGOSLAVIA IN THE 1930s", 843),
    P("Born in 1918 from the ruins of Austria-Hungary, the kingdom unites Serbs, Croats and Slovenes under a single crown. In 1934, King Alexander I is assassinated in Marseille. His cousin, Prince Paul, rules as regent over a divided country, wedged between Mussolini’s Italy and Hitler’s Germany.", 901),
    P("On the coast, Dubrovnik still lives to the rhythm of yachts and balls. The great families spend their summers there as if Europe would never tip over.", 1067)]},
"p12": {"rects": [[55, 795, 1010, 1320]], "left": 72, "size": 22, "width": 905, "lh": 30, "lines": [
    H("THE ABWEHR", 822),
    P("German military intelligence. Since 1935 it has been run by Admiral Wilhelm Canaris, a secretive man whose true allegiance would long be debated. Its agents recruit in business circles, ports, universities and high society all over Europe.", 869),
    H("JOHNNY JEBSEN", 1049),
    P("Heir to a shipping family, a brilliant student, ironic and fragile. Popov’s friend since Freiburg. He joins the Abwehr at the start of the war, partly, it is said, to avoid the front.", 1093),
    P("In February 1945, the Gestapo takes him from the camp where he was held. He is never seen again, almost certainly murdered.", 1201),
    P("In 2012, historian Ben Macintyre called him a hero. His silence protected Popov and thousands of Allied soldiers.", 1280)]},
"p16": {"rects": [[55, 1155, 1000, 1425]], "left": 67, "size": 20, "width": 880, "lh": 27, "lines": [
    H("LISBON 1940, A NEST OF SPIES", 1178, size=21, underline=None),
    P("Salazar’s Portugal stays neutral. Lisbon becomes the last way out of Europe at war: tens of thousands of refugees wait there for a visa, a ship, a seat on the Pan Am seaplane to New York.", 1230),
    P("In Estoril, the two sides share the grand hotels: the British at the Palácio, the Germans at the Atlântico. In the evening, everyone meets at the casino. They gamble, they drink, and above all, they listen.", 1361)]},
"p19": {"rects": [[60, 1035, 1010, 1445]], "left": 71, "size": 22, "width": 900, "lh": 29, "lines": [
    H("THE DOUBLE CROSS SYSTEM", 1059),
    P("In 1940, MI5 pulls off an extraordinary feat: almost every spy Germany sends to England is spotted and arrested. Once caught, they have only one choice: cooperate, or face British justice.", 1113),
    P("Those who agree keep writing to their German handlers. But every message is drafted in London by a secret committee, the Twenty Committee. In Roman numerals, twenty is written XX: the “double cross”.", 1255),
    P("Berlin believes it has a vast network in England. In reality, the entire network works for the British.", 1407)]},
"p22": {"rects": [[60, 962, 1000, 1435]], "left": 77, "size": 21, "width": 895, "lh": 26, "lines": [
    H("FLEMING, POPOV AND THE JAMES BOND LEGEND", 983, size=24),
    P("In May 1941, a young British naval intelligence officer stops in Lisbon with his admiral, on the way to America. His name is Ian Fleming. One evening, at the Estoril casino, he plays... and loses.", 1052),
    P("Twelve years later, in 1953, he publishes his first novel, Casino Royale. Its hero, James Bond, ruins an opponent at baccarat.", 1181),
    P("In his memoirs, in 1974, Dusko Popov claims that Fleming was watching him that night and that the scene comes from him. Fleming’s biographers doubt it: the dates don’t quite fit, and Fleming always said Bond was a blend of several men.", 1288),
    P("The truth lies somewhere between the gaming table and the champagne.", 1426)]},
"p26": {"rects": [[55, 1095, 1010, 1495]], "left": 65, "size": 20, "width": 900, "lh": 26, "lines": [
    H("THE MICRODOT", 1127, size=34, underline=20),
    P("A whole page, photographed and then shrunk about two hundred times, down to the size of a punctuation mark. Stuck on an ordinary letter or invoice, it passes under the censors’ eyes without raising the slightest suspicion. To read it, you need a microscope.", 1181),
    P("In August 1941, four microdots cross the Atlantic in Dusko Popov’s luggage. They hold a two-page German questionnaire about America: its factories, its aircraft, its bases. And one Pacific island, Hawaii.", 1308),
    P("It is through Popov that the FBI discovers the technique. In 1946, its director will describe this discovery in the American press. Without mentioning Popov’s name.", 1436)]},
"p31": {"rects": [[60, 1090, 1010, 1445]], "left": 69, "size": 20, "width": 890, "lh": 27, "lines": [
    H("PEARL HARBOR, ON THE EVE OF 7 DECEMBER 1941", 1112, size=21, underline=None),
    P("Home of the US Pacific Fleet. Eight battleships are in port, most of them moored in a row along Ford Island. The harbour is shallow, about twelve metres: a torpedo attack there is judged impossible. No net protects the battleships.", 1166),
    P("On 26 November, six Japanese aircraft carriers left the Kuril Islands in secret, under radio silence. On board, more than 350 aircraft. And torpedoes modified for shallow water: the lesson of Taranto.", 1302),
    P("Hickam, Wheeler, Kaneohe: the island’s airfields were all in Popov’s questionnaire.", 1411)]},
"p37": {"rects": [[90, 960, 1000, 1405]], "left": 100, "size": 25, "width": 840, "lh": 32, "lines": [
    H("AFTER THE WAR", 1006, size=36, underline=20),
    P("What we know. Dusko Popov receives the Order of the British Empire and becomes a British citizen. He goes into business and lives between Switzerland and the French Riviera. In 1974, he publishes his memoirs. J. Edgar Hoover had died two years earlier.", 1081),
    P("What we will never know. Whether Ian Fleming really watched him at the Estoril casino. Why the questions about Hawaii never left the FBI’s offices. And where Johnny Jebsen lies, declared dead in 1950, with no grave.", 1274)]},
"p40": {"rects": [[515, 700, 1000, 1275], [40, 1450, 1000, 1490]], "left": 525, "size": 25, "width": 440, "lh": 33, "lines": [
    H("RENDEZ-VOUS AVEC X", 736, size=31, underline=22),
    P("This episode is freely adapted from Patrick Pesnot’s programme on France Inter, broadcast on 26 May 2012.", 802),
    P("To Patrick Pesnot, who for twenty years took us to meet the men in the shadows.", 997),
    P("And to Monsieur X, who never existed, and whom we all believed.", 1164),
    {"text": "Photo of Patrick Pesnot: Radio France / Christophe Abramowitz. Photos of Dusko Popov: all rights reserved.", "y": 1471, "x": 55, "size": 15}]},
}

# Légendes manuscrites posées sur le papier (schémas) : même police que les bulles, centrées sur "cx".
L = lambda t, cx, y, size=27: {"text": t, "cx": cx, "y": y, "size": size, "font": "comic"}
LABELS = {
"p19": {"flow": False, "rects": [[395, 318, 615, 376], [62, 566, 282, 597], [708, 518, 975, 556], [785, 880, 925, 913], [355, 918, 585, 986]], "lines": [
    L("BERLIN SENDS", 503, 342), L("A SPY", 510, 371), L("BERLIN FALLS FOR IT", 171, 590, 25),
    L("ARRESTED BY MI5", 840, 548), L("TURNED", 854, 908),
    L("THE COMMITTEE", 467, 948), L("DICTATES THE MESSAGES", 470, 979, 25)]},
"p26": {"flow": False, "rects": [[70, 74, 310, 106], [405, 78, 632, 112], [718, 92, 980, 128]], "lines": [
    L("A WHOLE PAGE", 189, 102), L("SHRUNK 200 TIMES", 519, 109), L("STUCK ON A LETTER", 848, 124)]},
}
