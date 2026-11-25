"""Grouping incrementale O(N*d); nessuna matrice NxN o chaining illimitato."""
import math


def unit_vector(vector):
    values = [float(value) for value in vector]
    if not values or not all(math.isfinite(value) for value in values):
        raise ValueError("Embedding vuoto o non finito")
    norm = math.sqrt(sum(value * value for value in values))
    if norm <= 1e-12:
        raise ValueError("Embedding nullo")
    return [value / norm for value in values]


def cosine(left, right):
    if len(left) != len(right):
        raise ValueError("Dimensioni embedding incompatibili")
    dot = float(left @ right) if hasattr(left, "dtype") else sum(a * b for a, b in zip(left, right))
    return max(-1.0, min(1.0, dot))


def group_photos(photos, embeddings, threshold=0.94, max_gap=3.0, max_group=25, normalized=False):
    if not math.isfinite(threshold) or not -1 <= threshold <= 1:
        raise ValueError("Soglia coseno non valida")
    if not math.isfinite(max_gap) or max_gap < 0 or max_group < 1:
        raise ValueError("Limiti di sequenza non validi")
    if len(photos) != len(embeddings):
        raise ValueError("Una foto deve avere esattamente un embedding")
    vectors = embeddings if normalized else [unit_vector(vector) for vector in embeddings]
    groups = []
    anchor = previous = None
    for index, (photo, vector) in enumerate(zip(photos, vectors)):
        similarity_anchor = similarity_previous = None
        join = False
        if previous is not None:
            prior = photos[previous]
            gap = photo["sequence_time_seconds"] - prior["sequence_time_seconds"]
            similarity_anchor = cosine(vector, vectors[anchor])
            similarity_previous = cosine(vector, vectors[previous])
            join = (
                photo["sequence_time_source"] == prior["sequence_time_source"]
                and 0 <= gap <= max_gap
                and similarity_anchor >= threshold and similarity_previous >= threshold
                and len(groups[-1]["photo_ids"]) < max_group
            )
        if not join:
            anchor = index
            groups.append({"id": "group-" + photo["id"][:16], "photo_ids": []})
        group = groups[-1]
        group["photo_ids"].append(photo["id"])
        photo["group_id"] = group["id"]
        photo["similarity_to_anchor"] = round(similarity_anchor, 6) if join else None
        previous = index
    by_id = {photo["id"]: photo for photo in photos}
    for group in groups:
        # Tie-break deterministico: il primo elemento della sequenza.
        ranked = sorted(group["photo_ids"], key=lambda identifier: -by_id[identifier]["scores"]["overall"])
        group["suggested_photo_id"] = ranked[0]
        for rank, identifier in enumerate(ranked, 1):
            by_id[identifier]["rank_in_group"] = rank
    return groups
