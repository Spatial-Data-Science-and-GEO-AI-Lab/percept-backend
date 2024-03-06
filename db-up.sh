#!/bin/bash
shopt -s globstar

if [ -n "$1" ]; then
  kind="$1"
else
  kind="dev"
fi

db=percept-"$kind"


for f in migrations/**/up.sql; do
  psql -f "$f" "$db"
done

for f in seeds/{"$kind",all}/**/*.sql; do
  psql -f "$f" "$db"
done
