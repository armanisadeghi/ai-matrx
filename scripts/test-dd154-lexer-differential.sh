#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
runner="$repo/scripts/test-dd154-current-guard-controls.sh"
work=$(mktemp -d /tmp/dd154-lexer-proof.XXXXXX)
trap 'rm -rf "$work"' EXIT
python3 - "$work/corpus.sql" "$work/mutate.sql" "$work/draft.sql" "$repo/scripts/migration-drafts/dd154_lexer_character_array.sql" "$repo/../common-docs/projects/no-db-assigned-org/census/guard-performance/live-guard.sql" <<'PY'
import hashlib,pathlib,sys
corpus,mutate,draft,real,live=map(pathlib.Path,sys.argv[1:])
cases=[('colon','NEW.organization_id := gen_random_uuid()','23514'),('equals','NEW.organization_id = gen_random_uuid()','23514'),('comparison','IF NEW.organization_id = OLD.organization_id THEN NULL; END IF','00000'),('quoted','NEW."Organization_Id" := gen_random_uuid()','00000'),('u4',r'NEW.U&"organizat\0069on_id" := gen_random_uuid()','23514'),('u6',r'NEW.U&"organizat\+000069on_id" := gen_random_uuid()','23514'),('custom',r'''NEW.U&"organizat!0069on_id" UESCAPE '!' := gen_random_uuid()''','23514'),('nested','/* outer /* NEW.organization_id := gen_random_uuid() */ outer */ NULL','00000'),('dollar','PERFORM $q$NEW.organization_id := gen_random_uuid()$q$','00000'),('escape',r"PERFORM E'it\\'s'; NEW.organization_id := gen_random_uuid()",'42601'),('line','-- comment\nNEW.organization_id := gen_random_uuid()','23514'),('largecomment','/*'+(' unicode \\0069 ' * 500)+'*/ NEW.organization_id := gen_random_uuid()','23514'),('largedollar','PERFORM $q$'+('NEW.organization_id := text '*500)+'$q$; NEW.organization_id := gen_random_uuid()','23514'),('largeunicode',"PERFORM U&'"+(r'\0061'*1200)+r"'; NEW.U&\"organizat\0069on_id\" := gen_random_uuid()",'23514'),('largequotedtail',"NEW.organization_id := gen_random_uuid(); PERFORM E'"+("tail\\'"*1200)+"end'",'23514')]
out=["CREATE TEMP TABLE lex(label text primary key, got text, expected text);","CREATE FUNCTION pg_temp.c(l text,b text,e text) RETURNS void LANGUAGE plpgsql AS $f$ DECLARE s text='00000'; BEGIN BEGIN EXECUTE format('CREATE FUNCTION public.lex_%s() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN %s; RETURN NEW; END $b$',l,b); EXCEPTION WHEN OTHERS THEN s=SQLSTATE; END; INSERT INTO lex VALUES(l,s,e); END $f$;"]
for l,b,e in cases: out.append(f"SELECT pg_temp.c($l${l}$l$,$b${b}$b$,$e${e}$e$);")
out += ["SELECT 'LEX|'||label||'|'||got FROM lex ORDER BY label;","DO $$ BEGIN IF EXISTS(SELECT 1 FROM lex WHERE got<>expected) THEN RAISE EXCEPTION 'lexical literal expectation failed'; END IF; END $$;"]
corpus.write_text('\n'.join(out))
body=live.read_text().split('AS $function$',1)[1].rsplit('$function$',1)[0]
mutated=body+'\n-- substr(v_function_source, v_scan_pos, 1)'
sha=hashlib.sha256(mutated.encode()).hexdigest()
text=real.read_text().replace('db595feedc5bcc3840345e16fb982c6bcebaa91a9c5b997140d69ed9106dd3a6',sha)
draft.write_text(text)
mutate.write_text("DO $$ DECLARE d text; h text; s text; BEGIN SELECT pg_get_functiondef('platform._ddl_guard()'::regprocedure),prosrc INTO d,s FROM pg_proc WHERE oid='platform._ddl_guard()'::regprocedure; h:=split_part(d,'$function$',1); EXECUTE h||'$function$'||s||E'\\n-- substr(v_function_source, v_scan_pos, 1)'||'$function$'; END $$;")
print(hashlib.sha256(text.encode()).hexdigest())
PY
alt_sha=$(shasum -a 256 "$work/draft.sql" | awk '{print $1}')
if ! DD154_CURRENT_SKIP_DRAFT=1 DD154_CURRENT_BEFORE_CONTROLS_SQL="$work/corpus.sql" "$runner" >"$work/base" 2>&1; then tail -100 "$work/base" >&2; exit 1; fi
if ! DD154_CURRENT_REPEAT_DRAFT=1 DD154_CURRENT_BEFORE_CONTROLS_SQL="$work/corpus.sql" "$runner" >"$work/opt" 2>&1; then tail -100 "$work/opt" >&2; exit 1; fi
diff -u <(grep 'LEX|' "$work/base" | sed 's/^[[:space:]]*//') <(grep 'LEX|' "$work/opt" | sed 's/^[[:space:]]*//')
set +e
DD154_CURRENT_BEFORE_DRAFT_SQL="$work/mutate.sql" "$runner" >"$work/unknown" 2>&1; unknown=$?
DD154_CURRENT_BEFORE_DRAFT_SQL="$work/mutate.sql" DD154_CURRENT_DRAFT_OVERRIDE="$work/draft.sql" DD154_CURRENT_DRAFT_SHA="$alt_sha" "$runner" >"$work/anchor" 2>&1; anchor=$?
set -e
if [[ $unknown -eq 0 ]] || ! grep -q 'unknown _ddl_guard source' "$work/unknown"; then tail -60 "$work/unknown" >&2; exit 1; fi
if [[ $anchor -eq 0 ]] || ! grep -q 'fixed-width source anchors are ambiguous' "$work/anchor"; then tail -60 "$work/anchor" >&2; exit 1; fi
grep 'PASS current idempotence:' "$work/opt"
echo 'PASS DD154 lexer proof: 15 literal expected DDL outcomes, baseline/optimized differential, idempotence, unknown-preimage and re-pinned ambiguous-anchor refusals'
