export interface PlaceSearchResult {
    id: string
    name: string
    district: string
    address: string
    adcode: string
    longitude: number | null
    latitude: number | null
}

export function hasPlaceCoordinates(place: PlaceSearchResult): place is PlaceSearchResult & {
    longitude: number
    latitude: number
} {
    return place.longitude !== null && place.latitude !== null
}
