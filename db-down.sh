#!/bin/bash
shopt -s globstar

if [ -n "$1" ]; then
  kind="$1"
else
  kind="dev"
fi

db=percept-"$kind"


for f in migrations/**/down.sql; do
  psql -f "$f" "$db"
done
