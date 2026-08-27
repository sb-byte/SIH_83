from typing import Any, List, Optional
from ..models.user import User

def row_in_scope(user: User, item: Any) -> bool:
    """
    Check if a data row is within the user's geographic jurisdiction.
    Matches server scoping rules:
      T1: National scope (all rows in scope)
      T2: Region scope (item.region == user.region)
      T3, T4, T5: Site scope (item.site == user.site, with region safety check)
    """
    if not user:
        return False
    
    if user.role == "T1":
        return True
        
    row_region = getattr(item, 'region', None)
    row_site = getattr(item, 'site', None)
    
    # Dict fallback
    if isinstance(item, dict):
        row_region = item.get('region')
        row_site = item.get('site') or item.get('jurisdiction')

    # Non-geographic / shared row
    if not row_region and not row_site:
        return True
        
    if user.role == "T2":
        return not row_region or row_region == user.region
        
    # T3 / T4 / T5 are site-scoped
    if row_site and user.site:
        if row_site != user.site:
            return False
        # If row carries region too, must match user's region
        return not row_region or not user.region or row_region == user.region
        
    return False

def filter_scoped(user: User, items: List[Any]) -> List[Any]:
    """Filter a list of items to only those within the user's jurisdiction."""
    return [item for item in items if row_in_scope(user, item)]

def ensure_in_scope(user: User, item: Any, entity_name: str = "Resource"):
    """
    Ensure an item is within user's jurisdiction scope.
    If out of scope, raises HTTP 404 Not Found (deliberately 404, not 403, to avoid confirming existence).
    """
    from fastapi import HTTPException, status
    if not item or not row_in_scope(user, item):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{entity_name} not found"
        )
    return item

