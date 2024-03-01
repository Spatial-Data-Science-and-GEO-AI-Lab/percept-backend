#!/usr/bin/env python3

import psycopg2
import argparse
from jinja2 import Template

template = Template("""
<html>
  <body>
    <table border="1">
      <tr><td>date</td><td>{{ date }}</td><td>since yesterday</td><td>since last week</td></tr>
      <tr><td># ratings</td><td>{{ rating_count }}</td><td>{{ rating_count_diff1d }}</td><td>{{ rating_count_diff1w }}</td></tr>
      <tr><td># surveys</td><td>{{ survey_count }}</td><td>{{ survey_count_diff1d }}</td><td>{{ survey_count_diff1w }}</td></tr>
      <tr><td># rated images</td><td>{{ rated_image_count }}</td><td>{{ rated_image_count_diff1d }}</td><td>{{ rated_image_count_diff1w }}</td></tr>
    </table>
  </body>
</html>
""")


def parse_arguments():
  parser = argparse.ArgumentParser(description='Generate a report about the Percept data')
  parser.add_argument('--db', '-d', type=str, help='Database name', default='percept-dev')
  parser.add_argument('--datetime', type=str, help='Act as if this was the current timestamp (ISO-8601 format)', default=None)
  args = parser.parse_args()
  return args

def main():
  params = {}
  def q(qstr, field):
    nonlocal params
    cursor.execute(qstr, (9999,))
    row = cursor.fetchone()
    if row: params[field] = row[0]
    cursor.execute(qstr, (1,))
    row = cursor.fetchone()
    if row: params[field + '_diff1d'] = row[0]
    cursor.execute(qstr, (7,))
    row = cursor.fetchone()
    if row: params[field + '_diff1w'] = row[0]

  args = parse_arguments()
  ts = f"'{args.datetime}'::timestamp" if args.datetime is not None else 'current_timestamp'
  conn = psycopg2.connect(
    database=args.db
  )

  cursor = conn.cursor()

  cursor.execute(f"SELECT to_char({ts}, 'YYYY-MM-DD HH24:MI')")
  row = cursor.fetchone()
  if row: params['date'] = row[0]

  q(f"SELECT count(*) FROM rrating WHERE ts <= {ts} AND ts >= {ts} - interval '%s days'", 'rating_count')
  q(f"SELECT count(*) FROM session JOIN person USING (person_id) JOIN survey USING (survey_id) WHERE session_start <= {ts} AND session_start >= {ts} - interval '%s day' AND age >= 18", 'survey_count')
  q(f"SELECT count(distinct image_id) FROM rrating WHERE ts <= {ts} AND ts >= {ts} - interval '%s day'", 'rated_image_count')

  html = template.render(**params)
  print(html)
  cursor.close()
  conn.close()


if __name__=="__main__":
  main()
