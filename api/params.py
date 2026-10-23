"""Shared handling of repeated query parameters (`?countries=A&countries=B...`)."""

from fastapi import HTTPException

# More values than there are countries in any scope: a request with more is not a real selection, and is refused before any lookup.
MAX_LIST_VALUES = 250


def distinct(values: list[str] | None, name: str = "countries") -> list[str] | None:
    """The values without repeats, in the order first given. A repeated value used to repeat its whole series in the answer, so a short
    request could ask for megabytes; an absurdly long one is refused with 422."""
    if values is None:
        return None
    if len(values) > MAX_LIST_VALUES:
        raise HTTPException(status_code=422, detail=f"at most {MAX_LIST_VALUES} values for `{name}` ({len(values)} given)")
    return list(dict.fromkeys(values))
