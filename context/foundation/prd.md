---
project: "MyNotes"
version: 1
status: draft
created: 2026-06-17
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# MyNotes — Product Requirements Document

## Vision & Problem Statement

Aktywnie myślący indywidualiści — osoby które łapią pomysły w ciągu dnia, robią notatki podczas spotkań i zapisują refleksje w trakcie czytania — tracą czas walcząc z narzędziami zaprojektowanymi pod ciężki edytor i hierarchiczną organizację. Moment bólu: pojawia się myśl "do złapania zanim ucieknie", a użytkownik musi najpierw zdecydować, gdzie ją położyć i jak sformatować. Koszt dziś: notatki albo nie powstają w ogóle, albo lądują w narastającym stosie, do którego nikt nie wraca, więc nigdy nie zamieniają się we wnioski.

Konkurencja (Notion, Apple Notes, Obsidian) inwestuje w bogatszy edytor, głębsze hierarchie i współpracę. Wgląd, na którym opiera się MyNotes: wąskim gardłem osobistego myślenia nie jest edytor, tylko **powrót do tego, co już zostało zapisane**, i wyciągnięcie z tego sensu. Stąd przesunięcie wartości z "lepszego pisania" na "AI samo wraca do Ciebie z agregacjami i podsumowaniami". Edytor jest celowo prosty; praca dzieje się po stronie agregacji i podsumowań.

## User & Persona

**Primary persona: Aktywnie myślący indywidualista.**

- **Rola**: pracownik wiedzy / twórca / osoba ucząca się — pisze dla siebie, nie dla zespołu. Autor projektu pasuje do tej persony.
- **Kontekst**: pracuje głównie przy laptopie (web), przez cały dzień napotyka momenty wartych zapisania myśli — w trakcie zadań, na spotkaniach, w czasie czytania.
- **Moment, w którym sięga po MyNotes**:
  - łapanie ulotnej myśli ("zapisz, zanim ucieknie"),
  - notatki z bieżącego spotkania/rozmowy bez przerywania flow,
  - refleksje i wypisy w trakcie czytania/uczenia się.
- **Czego oczekuje**: szybkiego zapisu **bez ceremonii** (bez wyboru szablonu, folderu, formatowania) i **mechanizmu, który sam przyniesie mu wartość** z tego, co zapisał — bez konieczności ręcznego "robienia porządków".

## Success Criteria

### Primary

- Pełna pętla MVP działa end-to-end dla zalogowanego użytkownika: utworzenie notatki z własną etykietą → kliknięcie "Generuj digest" dla tej etykiety → wygenerowanie agregowanego digestu AI → po tygodniu automatyczne wygenerowanie nowej, ustrukturyzowanej notatki "Tygodniowe podsumowanie" przez AI (gdy w tygodniu są ≥3 notatki).
- ≥70% wygenerowanych przez AI digestów i podsumowań jest zaakceptowanych przez użytkownika, gdzie "zaakceptowane" oznacza niezmienione (implicit accept) lub edytowane inline; "odrzucone" oznacza usunięte. Mierzone w sekcji "AI dla mnie".

### Secondary

- _Brak deklarowanych celów drugorzędnych._ Primary jest jedynym miernikiem sukcesu MVP; nice-to-have outcome'y (np. tempo zapisu, retencja tygodniowa, adopcja tagów) zostaną zmierzone, jeśli MVP utrzyma się po pierwszych tygodniach, ale nie są warunkiem sukcesu.

### Guardrails

- **Izolacja danych użytkowników**: notatki, etykiety, digesty i podsumowania są ściśle związane z jednym kontem; żaden użytkownik nie ma dostępu do treści innego konta. Naruszenie tej granicy = porażka niezależnie od tego, czy Primary jest spełnione.
- **Trwałość notatek**: notatka utworzona przez użytkownika nigdy nie ginie w wyniku błędu generowania AI ani innego procesu pomocniczego. AI może nie wygenerować digestu (i to musi być widoczne dla użytkownika), ale to zdarzenie nie powoduje utraty żadnej oryginalnej treści.
- **Podłoga jakości AI — brak halucynacji**: digest i podsumowanie nie zawierają faktów, których nie było w notatkach źródłowych. Tekst generowany jest grounded w treści użytkownika; brak treści w notatkach → digest informuje o braku, a nie zmyśla.

## User Stories

### US-01: Użytkownik otrzymuje cotygodniowe podsumowanie AI

- **Given** zalogowany użytkownik, który w trakcie minionego tygodnia utworzył **co najmniej 3 notatki** (próg z FR-018)
- **When** kończy się tygodniowe okno rozliczeniowe systemu (7 dni od poprzedniego podsumowania lub od rejestracji konta)
- **Then** w **dedykowanej sekcji "AI dla mnie"** (oddzielnej od głównej listy notatek) pojawia się nowy wpis typu "Tygodniówka" z tytułem "Tygodniowe podsumowanie [data]" zawierający ustrukturyzowany, grounded wgląd AI w treści tygodnia

#### Acceptance Criteria

- Tygodniowe podsumowanie pojawia się w sekcji "AI dla mnie" w ciągu 24h od końca tygodniowego okna.
- Treść podsumowania jest grounded w notatkach użytkownika z minionego okna — nie zawiera faktów, których w notatkach nie było; brak materiału na stwierdzenie = jawne "brak materiału", nie konfabulacja.
- Jeśli w minionym tygodniu użytkownik utworzył <3 notatki, podsumowanie się NIE generuje (lepiej brak niż sztuczne/puste, spójne z guardrail jakości AI).
- Wpis tygodniówki jest edytowalny inline lub usuwalny w sekcji "AI dla mnie"; brak osobnego przycisku "akceptuj" — implicit accept (brak akcji) liczy się jako akceptacja.
- Sygnały do metryki Primary (≥70% akceptacji): niezmienione = accept; edytowane inline = accept; usunięte = reject.

## Functional Requirements

### Konta i sesja

- FR-001: Niezalogowany użytkownik może założyć konto poprzez OAuth z zewnętrznym providerem tożsamości. Priority: must-have
  > Socrates: Kontra rozważona: "email+hasło wymaga własnego flow resetu hasła i hashowania — w MVP dla persony 'ja sam' to niepotrzebny narzut". Decyzja: zmieniono — OAuth (Google) eliminuje cały flow zarządzania hasłami i pasuje do persony web-first. Konsekwencja: Access Control zaktualizowany.
- FR-002: Użytkownik może zalogować się do istniejącego konta tym samym OAuth flow (rejestracja i logowanie to ten sam ekran). Priority: must-have
  > Socrates: Kontra rozważona: "TTL sesji nie jest zdefiniowany, co daje bardzo różny UX". Decyzja: stoi jako FR; konkretne TTL i strategia odświeżania tokenu OAuth to detal implementacji — trafia do Open Questions w PRD.
- FR-003: Zalogowany użytkownik może się jawnie wylogować, unieważniając swoją sesję. Priority: must-have
  > Socrates: Kontra rozważona: "logout to detail UX, niepotrzebny jako oddzielny FR". Decyzja: stoi — jawne wylogowanie jest funkcją produktową (kontrola użytkownika nad sesją), zostaje jawne w PRD.

### Notatki (CRUD)

- FR-004: Zalogowany użytkownik może utworzyć notatkę zawierającą wyłącznie zwykły tekst, bez bogatego formatowania ani markdown. Priority: must-have
  > Socrates: Kontra rozważona: "persona w 2026 oczekuje markdown — bez nagłówków/list/code'u notatka jest niezdatna". Decyzja: wzmocniono — w MVP plain text only, świadoma cena za maksymalną prostotę edytora; markdown rozważany w v2 jeśli capture-flow okaże się sztywny.
- FR-005: Zalogowany użytkownik widzi płaską listę swoich notatek posortowaną od najnowszej. Pierwszym wierszem każdego elementu listy jest data utworzenia notatki. Priority: must-have
  > Socrates: Kontra rozważona: "płaska lista bez wyszukiwania to scrollowanie po 100 notatkach". Decyzja: stoi jako FR (lista), ale dodano nowy FR-020 (wyszukiwanie tekstowe) jako must-have w MVP — zaakceptowano, że bez search'a flow rozsypie się po pierwszym tygodniu użycia.
- FR-006: Zalogowany użytkownik może edytować pojedynczą notatkę inline w liście (kliknięcie wiersza otwiera edycję bezpośrednio, bez nawigacji do osobnego widoku szczegółów). Priority: must-have
  > Socrates: Kontra rozważona: "inline editing w liście jest szybsze i bardziej w duchu 'bez ceremonii' niż osobny widok szczegółów". Decyzja: zmieniono — FR-006 i FR-007 zostają zunifikowane w model inline-edit; brak osobnego widoku szczegółów w MVP.
- FR-007: (zmergowane z FR-006) Zalogowany użytkownik może edytować treść istniejącej notatki — edycja odbywa się inline (patrz FR-006). Priority: must-have
  > Socrates: Kontra rozważona: "edycja AI-generated tygodniowego podsumowania zaburza pomiar 70%". Decyzja: zachowano edycję; w pomiarze 70% akceptacji **edycja liczy się jako akceptacja** (użytkownik przyjął wartość, jedynie poprawił detale; usunięcie liczy się jako odrzucenie).
- FR-008: Zalogowany użytkownik może usunąć notatkę po potwierdzeniu w dialogu. Usunięcie jest definitywne (brak kosza w MVP). Priority: must-have
  > Socrates: Kontra rozważona: "twardy delete = ryzyko utraty notatki". Decyzja: zaakceptowano; dialog potwierdzenia jest minimalnym zabezpieczeniem, kosz/soft-delete kandydat na v2.

### Etykiety (tagi)

- FR-009: Zalogowany użytkownik może utworzyć nową etykietę w locie podczas pisania notatki; w trakcie wpisywania użytkownik widzi sugestie z istniejących etykiet tego samego konta. Priority: must-have
  > Socrates: Kontra rozważona: "free-form tagi rozjadą się przez literówki". Decyzja: wzmocniono — typeahead z istniejących tagów użytkownika redukuje powstawanie wariantów ("pomysły" / "pomysly" / "Pomysly") i chroni jakość AI-agregacji opartej na tagach.
- FR-010: Zalogowany użytkownik może przypisać jedną lub wiele etykiet do notatki, bez sztywnego limitu liczby tagów. Priority: must-have
  > Socrates: Kontra rozważona: "wiele tagów → ta sama notatka wpada w wiele digestów → użytkownik widzi tę samą myśl 3 razy". Decyzja: stoi — duplikacja w różnych kontekstach jest cechą, nie błędem; per-tag agregacja zachowuje znaczenie kontekstu.
- FR-011: Zalogowany użytkownik może filtrować listę notatek po pojedynczej etykiecie naraz (single-tag filter). Priority: must-have
  > Socrates: Kontra rozważona: "jednoczesne filtrowanie po wielu tagach (AND/OR) jest niezdefiniowane". Decyzja: zawężono — w MVP filtrujemy tylko po jednym tagu naraz; multi-tag (AND/OR) kandydat na v2 lub po feedbacku użytkowników.
- FR-012: (zmergowane z FR-007) Edycja przypisania etykiet na notatce jest częścią edycji notatki (FR-007), nie odrębną funkcją. Priority: nice-to-have
  > Socrates: Kontra rozważona: "redundantne z FR-007 — etykiety są częścią notatki". Decyzja: zmergowano; FR-012 zostaje jako placeholder w numeracji, ale nie wprowadza nowej funkcjonalności do PRD.

### Harmonogramy per-tag (poza zakresem MVP)

- FR-013: (CUT) Pierwotnie: użytkownik ustawia harmonogram per tag. Wycięte z MVP — zostaje jako placeholder kandydata na v2. Priority: nice-to-have
  > Socrates: Kontra rozważona: "konfigurowalny start+interwał to dużo UI; w v1 wystarczy stały interwał albo brak". Decyzja: wycięto całkowicie po doprecyzowaniu — skoro digest generuje się na klik użytkownika (FR-015), harmonogram nie ma wyzwalacza. Cały scheduler per-tag wraca dopiero w v2 razem z powiadomieniami systemowymi.
- FR-014: (CUT) Pierwotnie: edycja/wyłączanie harmonogramu. Wycięte razem z FR-013. Priority: nice-to-have
  > Socrates: Rozważono "tylko on/off w MVP", ale zdecydowano stoi — i ostatecznie cały harmonogram został usunięty z MVP w doprecyzowaniu po Socratic round.

### AI smart digesty (per tag)

- FR-015: Zalogowany użytkownik może wyzwolić generowanie digestu AI dla wybranej etykiety jednym kliknięciem ("Generuj digest"); system tworzy zagregowane podsumowanie korzystając z notatek tej etykiety od czasu ostatniego digestu (lub od początku, jeśli pierwszy raz). Priority: must-have
  > Socrates: Kontra rozważona: "user-triggered jest tańszy i bardziej deterministyczny w MVP — brak schedulera, brak race conditions". Decyzja: zmieniono — digest generuje się WYŁĄCZNIE na klik użytkownika; brak schedulera w MVP. Auto-generacja po harmonogramie wraca w v2 razem z powiadomieniami systemowymi.
- FR-016: Zalogowany użytkownik widzi wygenerowane digesty per-tag w dedykowanej sekcji AI ("AI dla mnie"), wspólnej z tygodniowymi podsumowaniami; lista ułożona od najnowszego, oznaczona tagiem źródłowym. Priority: must-have
  > Socrates: Kontra rozważona: "lepiej wbić digest jako notatkę w głównej liście — mniej UI, jeden mental model". Decyzja: po doprecyzowaniu wybrano spójny mental model — wszystkie AI-content (digesty + tygodniówki) w jednej dedykowanej sekcji "AI dla mnie". Główna lista pozostaje wyłącznie strumieniem user-content.
- FR-017: Zalogowany użytkownik może edytować inline lub usunąć digest. Brak jawnej akcji "akceptuj" — niezmieniony i nieusunięty digest = implicit accept. Edycja = accept (poprawione przyjęte); usunięcie = reject (sygnały Primary 70%). Priority: must-have
  > Socrates: Kontra rozważona: "akcja 'akceptuj' jest sztuczna; brak akcji = implicit accept jest wystarczający". Decyzja: zmieniono — usunięto przycisk "akceptuj"; metryka liczy implicit accept. Konsekwencja: prostszy UI digestu, mniej kliknięć.

### AI tygodniowe podsumowanie

- FR-018: System raz w tygodniu generuje nową, ustrukturyzowaną notatkę "Tygodniowe podsumowanie" zawierającą wnioski ze wszystkich notatek użytkownika z minionego tygodnia, **pod warunkiem że w tym tygodniu powstały ≥3 notatki użytkownika**. Poniżej progu podsumowanie nie powstaje. Priority: must-have
  > Socrates: Kontra rozważona: "co jeśli użytkownik napisał tylko 1–2 notatki? Podsumowanie z 1 notatki to nonsens — potrzeba minimalnego progu". Decyzja: wzmocniono — próg ≥3 notatek per tydzień; poniżej progu pomijamy generowanie (spójne z guardrail "lepiej brak niż sztuczne").
- FR-019: Wygenerowana notatka tygodniowa pojawia się w dedykowanej sekcji AI (wspólnej z digestami z FR-016) z rozróżnialnym typem "tygodniówka". Może być edytowana inline lub usunięta; brak jawnego "akceptuj" (implicit accept jak FR-017). Priority: must-have
  > Socrates: Kontra rozważona: "mieszanie AI-content z user-content w głównej liście myli — lepsza dedykowana sekcja". Decyzja: zmieniono — wszystkie AI-content (digesty + tygodniówki) w dedykowanej sekcji "AI dla mnie", poza głównym strumieniem notatek użytkownika.

### Wyszukiwanie

- FR-020: Zalogowany użytkownik może wyszukiwać notatki po fragmencie tekstu w treści; dopasowanie ignoruje wielkość liter i znajduje fragmenty wewnątrz słów. Priority: must-have
  > Socrates: Dodano podczas Socratic FR-005 — bez wyszukiwania płaska lista staje się bezużyteczna po pierwszym tygodniu użycia, co rozsypuje cały MVP flow.

## Non-Functional Requirements

- **Latencja zapisu notatki**: po wyzwoleniu akcji zapisu (klik "zapisz" lub równoważny skrót klawiszowy) użytkownik widzi potwierdzenie zapisu w czasie < 500 ms (wartość 95-percentylowa). Wartość "capture bez ceremonii" rozpada się przy widocznych opóźnieniach.
- **Ciągłe widoczne informowanie o postępie generowania AI**: w trakcie tworzenia digestu lub tygodniowego podsumowania użytkownik dostrzega nieprzerwany sygnał, że operacja trwa; żadne okno bez widocznego postępu nie przekracza 2 sekund.
- **Wsparcie przeglądarek**: aplikacja jest w pełni używalna w najnowszych dwóch głównych wersjach Chrome, Firefox, Safari i Edge w trybie desktopowym.

## Business Logic

**MyNotes kondensuje notatki użytkownika — wybrane po tagu albo z minionego tygodnia — w pojedyncze podsumowanie AI, które wyciąga z nich tematy i wnioski, oparte wyłącznie na tym, co użytkownik faktycznie napisał.**

Reguła konsumuje trzy wejścia, wszystkie pochodzące od użytkownika: (1) treść notatek zapisaną w okresie istotnym dla danej agregacji, (2) etykiety, którymi użytkownik te notatki opisał, oraz (3) wybrany zakres — albo "wszystkie notatki pod tagiem X od ostatniego digestu" (przy generowaniu digestu na klik), albo "wszystkie notatki w minionym oknie 7 dni" (przy cotygodniowym podsumowaniu, pod warunkiem ≥3 notatek w tygodniu). Reguła nigdy nie dociąga wiedzy spoza tych wejść.

Wyjściem reguły jest tekst podsumowania: skondensowany przegląd zawierający tematy, decyzje, otwarte wątki i — gdy występują — sprzeczności pomiędzy notatkami źródłowymi. Tekst musi być grounded w treści wejściowej; jeżeli zakres nie zawiera materiału na konkretne stwierdzenie, podsumowanie tego nie zmyśla, tylko mówi wprost "brak materiału". Brak treści w zakresie = brak generowania (zwłaszcza dla tygodniówki).

Użytkownik styka się z wyjściem w **dedykowanej sekcji "AI dla mnie"** (osobnej od głównej listy notatek), gdzie widzi listę wygenerowanych podsumowań — digesty oznaczone tagiem źródłowym oraz cotygodniowe podsumowania oznaczone okresem — z możliwością inline edycji i usunięcia. Implicit accept (brak akcji) jest sygnałem zaakceptowania; edycja również liczy się jako akceptacja, usunięcie jako odrzucenie. Te sygnały zasilają metrykę Primary "≥70% akceptacji".

## Access Control

Aplikacja jest wielo-użytkownikowa z prostym, płaskim modelem dostępu.

- **Sposób dostępu**: federacyjne uwierzytelnienie (OAuth) z zewnętrznym providerem tożsamości. Użytkownik nie ustanawia ani nie zarządza własnym hasłem w MyNotes; rejestracja i logowanie to ten sam przepływ "zaloguj się przez providera", który tworzy konto przy pierwszej autoryzacji. Niezalogowany użytkownik nie ma dostępu do żadnej funkcji notatek; widzi wyłącznie ekran logowania. (Wybór konkretnego providera tożsamości należy do tech-stack-selection — patrz shape-notes Forward block.)
- **Model ról**: płaski — wszyscy zalogowani użytkownicy są równoprawni. Każdy użytkownik widzi i edytuje wyłącznie własne notatki, etykiety, digesty i podsumowania. Brak roli admina, brak poziomów płatności.
- **Granica danych**: notatki, etykiety, digesty i podsumowania są ściśle związane z jednym kontem. Żaden mechanizm współdzielenia ani udostępniania między kontami nie jest częścią MVP.
- **Trafienie w gated route bez sesji**: niezalogowany użytkownik próbujący trafić w widok notatek jest przekierowywany na ekran logowania.
- **Wylogowanie**: pozostaje jawną akcją w UI (ręczne unieważnienie sesji), niezależnie od czasu życia tokena uwierzytelnienia.

## Non-Goals

Lista rzeczy, które MVP **świadomie nie robi**, żeby nie wpełzły z powrotem przez "a może by tak…".

- **Brak bogatego edytora** (WYSIWYG, markdown, tabele, obrazy, własne style) — notatka to plain text. Wartość produktu nie leży w bogactwie edytora; rozważymy w v2 jeśli persona przyjdzie z konkretnym brakiem.
- **Brak wgrywania plików zewnętrznych** (PDF, DOCX, CSV, obrazy) — wprowadzanie treści wyłącznie ręcznie lub kopiuj-wklej.
- **Brak udostępniania, współedycji, publicznych linków** — produkt jest ściśle single-tenant per konto; pozwala metryce "70% akceptacji" odnosić się do indywidualnego kontekstu.
- **Brak wielopoziomowych folderów ani drzew katalogów** — organizacja oparta wyłącznie na płaskiej liście + tagi. Tagi (z sugestiami) są jedynym wymiarem klasyfikacji; hierarchia byłaby kolejnym ceremoniałem, którego MVP unika.
- **Brak powiadomień systemowych w przeglądarce** — cała komunikacja AI dzieje się wewnątrz aplikacji w sekcji "AI dla mnie". Powiadomienia systemowe wracają do dyskusji w v2 razem z mobile.
- **Brak automatycznego generowania digestów per-tag** — digesty wyzwala wyłącznie użytkownik na klik. Auto-generowanie per-tag wraca w v2 razem z powiadomieniami systemowymi.
- **Brak natywnej aplikacji mobilnej** — wyłącznie web; mobile-friendly responsive nie jest gwarantowany w MVP (patrz Open Question #2).

## Open Questions

1. **Czas życia (TTL) sesji uwierzytelnienia oraz strategia odświeżania tokenu** — nie zdefiniowany. Rozważone w Socratic FR-002 i świadomie odłożone jako detal implementacji. Owner: developer (autor projektu). By: tech-stack-selection / implementation phase. Block: nie (dowolna rozsądna domyślna polityka jest akceptowalna do PRD review).
2. **Mobile-friendly responsive web w MVP** — niejednoznaczne. Idea-notes mówi "tylko web" jako non-goal MVP, NFR wsparcia przeglądarek wymienia tylko desktop, ale czytelność na ekranie telefonu nie została jawnie potwierdzona ani jawnie wykluczona. Owner: użytkownik. By: PRD review. Block: nie.
3. **Higiena danych po stronie LLM (training opt-out)** — nie zdefiniowane. Treść notatek użytkowników będzie przekazywana do dostawcy LLM przy generowaniu digestów i tygodniówek; czy dostawca może używać tych treści do trenowania modeli, jest decyzją zależną od wyboru dostawcy/planu. Owner: użytkownik (decyzja produktowa) + downstream tech-stack-selection (techniczna realizacja). By: tech-stack-selection step. Block: tak — bez tej decyzji guardrail "izolacja danych użytkowników" ma niepełną definicję poza granicą aplikacji.
4. **Mobile-app w v2 vs nigdy** — nie zdecydowane. Idea-notes wyklucza mobile z MVP, ale nie wyklucza go z roadmapy. Owner: użytkownik. By: post-MVP roadmap. Block: nie (nie wpływa na MVP).
5. **Definicja "edycji" w metryce Primary 70%** — drobna ambiguity. Edycja AI-content liczy się jako akceptacja, ale nie zdefiniowano, czy KAŻDA edycja (poprawka literówki, rewrite całości) jest tym samym sygnałem; oraz czy "implicit accept" (brak akcji) ma okno czasowe (np. po 30 dniach bez akcji = accept). Owner: użytkownik. By: PRD review / metric design. Block: nie (jakakolwiek rozsądna definicja zadziała w MVP, do udokumentowania w PRD).


