# Pages bis de l'épisode 2 (EN). y = ligne de base de la première ligne ; **gras**.
H = lambda t, y, size=27, **k: {"text": t, "y": y, "size": size, "font": "typewriter-bold", "underline": 4, "underline_offset": 13, **k}
P = lambda t, y, **k: {"para": t, "y": y, **k}
L = lambda t, cx, y, size=22, **k: {"text": t, "cx": cx, "y": y, "size": size, "font": "comic", **k}

DOCS = {
"p01": {"rects": [[60, 1058, 1010, 1470]], "left": 84, "size": 22, "width": 900, "lh": 28, "lines": [
    H("WHO WAS KAARLO TUOMI, REALLY?", 1095),
    P("Born in 1916 in Michigan to Finnish parents. Taken to the Soviet Union at sixteen by a communist stepfather. Lumberjack in Karelia, Red Army soldier, English teacher. In 1958, sent back to the United States as an “illegal” spy. American-born, Soviet-trained: which of the two countries was he betraying?", 1152),
    P("It is said that he warned Moscow in the very first message the FBI dictated to him. That he switched sides a third time. Only he ever told it.", 1305)]},
"p06": {"rects": [[70, 1005, 1010, 1478]], "left": 87, "size": 22, "width": 900, "lh": 27, "lines": [
    H("KEW, THE NATION’S MEMORY", 1038),
    P("South-west of London, the National Archives hold nearly a thousand years of official documents, from the Domesday Book to the files of Downing Street.", 1091),
    P("For a long time the rule was simple: a government file became public thirty years after the events. Since 2013, that delay has been gradually cut to twenty years.", 1199),
    P("Margaret Thatcher’s files on the Falklands War were opened at the end of December 2012. They reveal London’s distrust of Paris, suspected of being ready to let Argentina acquire new Exocet missiles.", 1307),
    P("Other files stay closed far longer. Intelligence files above all.", 1443)]},
"p12": {"rects": [[60, 993, 1010, 1440]], "left": 74, "size": 22, "width": 905, "lh": 28, "lines": [
    H("KARELIAN FEVER", 1026),
    P("Between 1931 and 1934, six to seven thousand Finns from the United States and Canada left for Soviet Karelia, on the Finnish border. The unemployment of the Great Depression, the dream of a socialist republic where Finnish would be spoken: they were welcomed as pioneers, with their tools, their machines and their savings.", 1080),
    P("The dream soon turned sour. In 1937 and 1938, during the Great Terror, the American Finns were accused of espionage and nationalism. By one estimate, around seven hundred and forty of them were shot, most of them young men.", 1250),
    P("In 1939, war broke out between the USSR and Finland. The survivors were trapped.", 1400)]},
"p16": {"rects": [[60, 985, 1010, 1440]], "left": 81, "size": 21, "width": 905, "lh": 28, "lines": [
    H("TWO RIVAL HOUSES", 1009),
    P("In Moscow, two services share espionage abroad. The KGB, created in March 1954, the very year Tuomi was recruited, is the heir to Stalin’s political police. It watches the home front, hunts down dissidents and émigrés, and spies on Western politics and diplomacy.", 1063),
    P("The GRU is the military intelligence service of the General Staff. It targets armies, bases, weapons and technology.", 1205),
    P("Each has its “legal” agents, under diplomatic cover, and its own “illegals”. The two houses distrust each other and envy each other’s successes.", 1316),
    P("After 1991, the KGB was broken up. The GRU is still there.", 1430)]},
"p22": {"rects": [[60, 975, 1010, 1440]], "left": 77, "size": 21, "width": 910, "lh": 27, "lines": [
    H("THE TRADE OF AN ILLEGAL", 1005),
    P("1. Shortwave radio. At set times, Moscow broadcasts strings of numbers, in Morse or read out by a monotonous voice. Only whoever holds the right grid can understand them.", 1057),
    P("2. The one-time pad. Each page is used once, then burned. Used properly, this code is impossible to break.", 1161),
    P("3. The dead drop. A hollow stone, a hole in a tree, the underside of a bench: one agent leaves a message for another to collect. The two agents never meet.", 1242),
    P("4. The hollow coin. In 1953, in New York, a young newspaper boy drops a five-cent coin that splits in two: inside, a microfilm. It will take the FBI four years to trace its owner.", 1349)]},
"p25": {"rects": [[60, 1005, 1010, 1475]], "left": 75, "size": 23, "width": 900, "lh": 33, "lines": [
    H("“THE AMERICANS”", 1035),
    P("An American series broadcast on FX from 30 January 2013 to 30 May 2018, over six seasons. Its creator, Joe Weisberg, spent a few years at the CIA before becoming a novelist.", 1102),
    P("The story: in the early 1980s, under Reagan, two KGB officers live as an ordinary American couple in a Washington suburb. They run a travel agency, raise two children who know nothing, and live next door to an FBI agent tasked with hunting Soviet illegals.", 1232),
    P("The final season starts in the United States on 28 March 2018. The day after this recording.", 1431)]},
"p28": {"rects": [[60, 1043, 1012, 1482]], "left": 79, "size": 23, "width": 905, "lh": 31, "lines": [
    H("THE COLONELS WHO TALKED", 1074),
    P("Oleg Penkovsky, a GRU colonel, passed intelligence to London and Washington in 1961 and 1962. It helped the Americans during the Cuban missile crisis. Arrested in Moscow in October 1962, he was shot in May 1963.", 1137),
    P("Dmitri Poliakov, a GRU officer who rose to general, worked for the FBI and then the CIA for nearly twenty years. Betrayed by moles inside the American services themselves, he was arrested in 1986 and shot in 1988.", 1289),
    P("Both came from the same house as Kaarlo Tuomi. Both knew a great deal.", 1444)]},
"p34": {"flow": False, "ink_contrast": 14, "rects": [[60, 960, 1010, 1465]], "left": 87, "size": 22, "width": 900, "lh": 31, "lines": [
    H("OPERATION “GHOST STORIES”", 994),
    P("For nearly ten years, the FBI watched a network of illegals planted in the United States by Russian foreign intelligence. On 27 June 2010, it arrested ten people. The names they lived under:", 1052),
    {"text": "1. Richard and Cynthia Murphy, in Montclair (New Jersey).", "y": 1201},
    {"text": "2. Donald Heathfield and Tracey Foley, in Cambridge (Massachusetts).", "y": 1233},
    {"text": "3. Juan Lazaro and Vicky Peláez, in Yonkers (New York).", "y": 1265},
    {"text": "4. Michael Zottoli and Patricia Mills, in Virginia.", "y": 1297},
    {"text": "5. Mikhail Semenko, in Virginia.", "y": 1329},
    {"text": "6. Anna Chapman, in New York.", "y": 1361},
    P("An eleventh man, who handled the network’s money, was arrested two days later in Cyprus. Released on bail, he vanished.", 1424)]},
"p38": {"flow": False, "size": 19, "lh": 27, "rects": [
        [55, 655, 700, 714], [62, 731, 466, 775], [474, 731, 1005, 775],
        [62, 783, 466, 909], [474, 783, 1005, 909], [62, 917, 466, 1021], [474, 917, 1005, 1021],
        [62, 1029, 466, 1132], [474, 1029, 1005, 1132], [62, 1140, 466, 1246], [474, 1140, 1005, 1246],
        [62, 1254, 466, 1386], [474, 1254, 1005, 1386], [60, 1395, 1005, 1452]], "lines": [
    H("FICTION AND REALITY", 697, size=29, x=68),
    {"text": "WHAT WE SAW", "y": 761, "x": 68, "size": 23},
    {"text": "WHAT HAPPENED", "y": 761, "x": 489, "size": 23},
    P("James Bond, Ian Fleming’s seductive spy.", 815, x=68, width=385),
    P("Fleming, a naval intelligence officer, crossed paths with real double agents. Dusko Popov may have been one of his models; historians debate it.", 815, x=492, width=500),
    P("The moles in John le Carré’s novels.", 949, x=68, width=385),
    P("Le Carré worked for MI5 and MI6. He saw up close the damage done by Kim Philby and the “Cambridge Five”.", 949, x=492, width=500),
    P("“The Americans”: a KGB couple in suburban Washington.", 1059, x=68, width=385),
    P("The series was born of the 2010 arrests. One of the ten said it showed exactly what an illegal lives through.", 1060, x=492, width=500),
    P("“The Bureau” and its agents under false identities.", 1172, x=68, width=385),
    P("In the jargon, a “legend” really is an agent’s invented life. Tuomi had to learn his by heart.", 1172, x=492, width=500),
    P("“Bridge of Spies”: a swap on a Berlin bridge.", 1284, x=68, width=385),
    P("In 1962, the Soviet spy Rudolf Abel, owner of the Brooklyn hollow coin, was swapped for the American pilot Gary Powers.", 1284, x=492, width=500),
    {"text": "**Kaarlo Tuomi never got his own series.**", "y": 1437, "cx": 512, "size": 25}]},
"p42": {"rects": [[60, 668, 1012, 1460]], "left": 82, "size": 22, "width": 915, "lh": 30, "lines": [
    H("SALISBURY, MARCH 2018", 704, size=32, underline_offset=18),
    P("**Sunday 4 March, 1.40 p.m.:** Sergei Skripal and his daughter Yulia, who arrived from Moscow the day before, park their car in the town centre. They go to the pub, then have lunch at a restaurant until 3.35 p.m.", 769),
    P("**4.15 p.m.:** a passer-by calls for help. Father and daughter have been found unconscious on a bench. An army nurse who happened to be passing gives them first aid.", 887),
    P("**5.10 p.m.:** Yulia is flown out by helicopter, her father taken by road. A police officer who came to the scene falls ill in turn.", 1008),
    P("**12 March:** Prime Minister Theresa May announces that a military-grade nerve agent of the “Novichok” type, developed in Russia, was used. She judges Moscow’s responsibility “highly likely”.", 1098),
    P("**14 March:** London expels twenty-three Russian diplomats. Moscow denies any involvement.", 1220),
    P("**26 March:** more than a hundred Russian diplomats are expelled by some twenty allied countries. France sends four home. Father and daughter are still in a critical condition.", 1313),
    {"text": "September 2018: two suspects identified. Sergei and Yulia Skripal survived.", "y": 1440, "x": 84, "size": 34, "font": "script"}]},
"p46": {"flow": False, "size": 23, "lh": 33, "rects": [[60, 845, 1000, 1300], [60, 1340, 1012, 1515]], "lines": [
    {"text": "ACKNOWLEDGEMENTS", "y": 882, "cx": 512, "size": 40, "underline": 4, "underline_offset": 16},
    {"text": "**To Patrick Pesnot,** who taught us that History", "y": 956, "cx": 512},
    {"text": "can also be told in a low voice.", "y": 990, "cx": 512},
    {"text": "**To Kaarlo Tuomi,** who ended up telling his story.", "y": 1056, "cx": 512},
    {"text": "A little.", "y": 1090, "cx": 512},
    {"text": "This story is fiction built on real facts.", "y": 1156, "cx": 512, "size": 22},
    {"text": "The dialogue is imagined; the facts have been checked,", "y": 1189, "cx": 512, "size": 22},
    {"text": "and anything resting on a single source is flagged as such.", "y": 1222, "cx": 512, "size": 22},
    {"text": "Real people still living are never shown", "y": 1255, "cx": 512, "size": 22},
    {"text": "in a recognisable way.", "y": 1287, "cx": 512, "size": 22},
    P("Main sources: Patrick Pesnot’s France Inter programme on Kaarlo Tuomi, broadcast on 1 January and 16 July 2005; Kaarlo Tuomi, “Spy Lost” (Enigma Books, 2014); FBI files on Operation “Ghost Stories”; the British counter-terrorism police timeline of Salisbury; press of the time.", 1368, x=90, size=18, width=880, lh=26),
    {"text": "Photo of Patrick Pesnot: Radio France / Christophe Abramowitz.", "y": 1503, "x": 90, "size": 15}]},
}

LABELS = {
"p16": {"flow": False, "rects": [[300, 257, 383, 298], [412, 258, 496, 301], [540, 266, 622, 308], [651, 272, 734, 315]], "lines": [
    L("LEGALS", 341, 284, 20, weight=1), L("ILLEGALS", 454, 286, 20, weight=1), L("LEGALS", 581, 294, 20, weight=1), L("ILLEGALS", 692, 300, 20, weight=1)]},
"p45": {"flow": False, "ink_contrast": 18, "rects": [[150, 790, 462, 1035]], "lines": [
    {"text": "Some stories", "x": 192, "y": 836, "size": 30, "font": "script", "angle": 9},
    {"text": "are still too recent", "x": 176, "y": 866, "size": 30, "font": "script", "angle": 9},
    {"text": "to be broadcast.", "x": 168, "y": 896, "size": 30, "font": "script", "angle": 9},
    {"text": "Come back in thirty years.", "x": 155, "y": 944, "size": 30, "font": "script", "angle": 9},
    {"text": "— X", "x": 300, "y": 1018, "size": 34, "font": "script", "angle": 9}]},
}

RAW = {
"p00": [
    {"type": "plain", "rects": [[25, 645, 362, 745]], "fill": [2, 2, 2], "color": [240, 236, 228], "lines": [
        {"text": "THE ILLEGALS", "x": 36, "y": 734, "cap": 67, "weight": 470, "squeeze": 0.86, "fit": 303}]},
    {"type": "plain", "rects": [[38, 1411, 351, 1467]], "color": [24, 22, 20], "lines": [
        {"text": "EPISODE 2 • RECORDED 27.03.2018 •", "cx": 193, "y": 1434, "cap": 12, "font": "typewriter-bold", "fit": 300},
        {"text": "NEVER AIRED", "cx": 193, "y": 1457, "cap": 12, "font": "typewriter-bold", "fit": 160}]}],
}
