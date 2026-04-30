"""
knowledge_graph_service.py
Extracts lesson concepts and dependency relationships via LLM.
Stores in Neo4j when the driver is reachable, otherwise falls back to a local JSON file.
"""

import json
import os

from services.openrouter_service import safe_llm_call, parse_json_safe

_STORE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "knowledge_graphs.json")

_PROMPT = """\
Extract all key concepts and their relationships from the lesson content below.

Return ONLY this exact JSON — no explanation, no markdown:
{{
  "concepts": ["<concept name>", "..."],
  "relationships": [{{"from": "<concept>", "to": "<concept>"}}, "..."],
  "conceptDetails": [
    {{
      "id": "<slug-no-spaces>",
      "name": "<concept name>",
      "description": "<1-sentence description>",
      "difficulty": "basic"
    }}
  ],
  "dependencies": [
    {{"from": "<slug>", "to": "<slug>", "type": "prerequisite"}}
  ]
}}

difficulty values: basic | intermediate | advanced
dependency type values: prerequisite | builds_on | related
Extract 5-12 concepts. Only include dependencies clearly implied by the material.

Lesson content:
{content}"""


def build_graph(lesson_id: str, lesson_content: str) -> dict:
    """
    Call LLM to extract concepts and dependencies, persist, and return the graph.
    The returned dict is backward-compatible: `concepts` is always a flat string list.
    """
    raw = safe_llm_call(_PROMPT.format(content=lesson_content[:3000]))
    graph = parse_json_safe(raw)

    if not graph or "concepts" not in graph:
        graph = {
            "concepts": [],
            "relationships": [],
            "conceptDetails": [],
            "dependencies": [],
        }

    # Guarantee backward-compat flat list even if LLM only returned conceptDetails
    if not graph.get("concepts") and graph.get("conceptDetails"):
        graph["concepts"] = [c.get("name", "") for c in graph["conceptDetails"]]

    _persist(lesson_id, graph)
    return graph


# ── Storage ───────────────────────────────────────────────────────────────────

def _persist(lesson_id: str, graph: dict):
    try:
        _store_neo4j(lesson_id, graph)
    except Exception:
        _store_json(lesson_id, graph)


def _store_neo4j(lesson_id: str, graph: dict):
    from neo4j import GraphDatabase  # optional dep — ImportError triggers JSON fallback
    uri  = os.environ.get("NEO4J_URI",      "bolt://localhost:7687")
    auth = (os.environ.get("NEO4J_USER",     "neo4j"),
            os.environ.get("NEO4J_PASSWORD", ""))
    driver = GraphDatabase.driver(uri, auth=auth)
    with driver.session() as s:
        s.run("MATCH (c:Concept {lessonId:$lid}) DETACH DELETE c", lid=lesson_id)
        for c in graph.get("conceptDetails", []):
            s.run(
                "CREATE (:Concept {lessonId:$lid,id:$id,name:$name,description:$desc,difficulty:$diff})",
                lid=lesson_id, id=c["id"], name=c["name"],
                desc=c.get("description", ""), diff=c.get("difficulty", "basic"),
            )
        for dep in graph.get("dependencies", []):
            s.run(
                """MATCH (a:Concept {lessonId:$lid,id:$fid})
                   MATCH (b:Concept {lessonId:$lid,id:$tid})
                   CREATE (a)-[:DEPENDS_ON {type:$t}]->(b)""",
                lid=lesson_id, fid=dep["from"], tid=dep["to"],
                t=dep.get("type", "related"),
            )
    driver.close()


def _store_json(lesson_id: str, graph: dict):
    os.makedirs(os.path.dirname(_STORE_PATH), exist_ok=True)
    store: dict = {}
    if os.path.exists(_STORE_PATH):
        with open(_STORE_PATH) as f:
            store = json.load(f)
    store[lesson_id] = graph
    with open(_STORE_PATH, "w") as f:
        json.dump(store, f, indent=2)
