import * as turf from '@turf/turf';
import { Feature, FeatureCollection, Polygon, Position } from 'geojson';
import { CachedAssessment, Coordinates, DamageAssessment, EvacuationZone, Parcel } from '../types/schemas.js';
import { logger } from '../utils/logger.js';
import { CacheService } from './cache.service.js';

export class ArcGISService {
  private readonly GEOCODE_URL = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';
  private readonly EVACUATION_ZONES_URL = 'https://services.arcgis.com/RmCCgQtiZLDCtblq/arcgis/rest/services/Maximum_Extent_Evacuation_Zones/FeatureServer/0/query';
  private readonly PALISADES_PARCELS_URL = 'https://services.arcgis.com/RmCCgQtiZLDCtblq/arcgis/rest/services/Parcels_PalisadeFire/FeatureServer/0/query';
  private readonly EATON_PARCELS_URL = 'https://services.arcgis.com/RmCCgQtiZLDCtblq/arcgis/rest/services/Parcels_EatonFire/FeatureServer/0/query';
  private readonly PALISADES_DAMAGE_URL = 'https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/DINS_2025_Palisades_Public_View/FeatureServer/0/query';
  private readonly EATON_DAMAGE_URL = 'https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/DINS_2025_Eaton_Public_View/FeatureServer/0/query';
  private readonly cacheService: CacheService;

  constructor() {
    this.cacheService = CacheService.getInstance();
  }

  /**
   * Generate a cache key for the given coordinates
   * @param coordinates - The coordinates to generate a cache key for
   * @returns A cache key string
   */
  public generateCacheKey(coordinates: Coordinates): string {
    // Round coordinates to 5 decimal places (about 1.1 meters precision) to account for small variations
    const lat = Math.round(coordinates.latitude * 100000) / 100000;
    const lng = Math.round(coordinates.longitude * 100000) / 100000;
    return `assessment_${lat}_${lng}`;
  }

  /**
   * Get a cached assessment for the given coordinates
   * @param cacheKey - The cache key generated from coordinates
   * @returns The cached assessment or null if not found
   */
  public getCachedAssessment(cacheKey: string): CachedAssessment | null {
    return this.cacheService.get<CachedAssessment>(cacheKey);
  }

  /**
   * Cache an assessment result
   * @param cacheKey - The cache key generated from coordinates
   * @param assessment - The assessment to cache
   */
  public cacheAssessment(cacheKey: string, assessment: CachedAssessment): void {
    this.cacheService.set(cacheKey, assessment);
  }

  /**
   * Geocode an address using the ArcGIS Geocode API
   * @param address - The address to geocode. Can be a string or an object with street, city, state, and zip properties.
   * @returns The coordinates and normalized address of the geocoded address.
   */
  async geocodeAddress(address: string | { street?: string; city?: string; state?: string; zip?: string }): Promise<{ coordinates: Coordinates; address: string }> {
    try {
      const addressString = typeof address === 'string' 
        ? address 
        : `${address.street || ''}, ${address.city || ''}, ${address.state || ''} ${address.zip || ''}`.trim();

      const params = new URLSearchParams({
        SingleLine: addressString,
        f: 'json',
        outFields: 'location,address',
      });

      const response = await fetch(`${this.GEOCODE_URL}?${params}`);
      const data = await response.json();

      if (!data.candidates?.length) {
        throw new Error('INVALID_ADDRESS');
      }

      const candidate = data.candidates[0];
      const location = candidate.location;

      logger.debug({ location, addressString }, 'Geocoded address');

      return {
        coordinates: {
          latitude: location.y,
          longitude: location.x,
        },
        address: candidate.address
      };
    } catch (error) {
      logger.error({ error }, 'Error geocoding address');
      if (error instanceof Error && error.message === 'INVALID_ADDRESS') {
        throw error;
      }
      throw new Error('GEOCODING_ERROR');
    }
  }

  /**
   * Find the maximum extent evacuation zone for a given set of coordinates. (e.g. Evacuation Warning, Evacuation Order)
   * This represents the most severe evacuation zone designation ever set for this location during the height of the fire.
   * @param coordinates - The coordinates to find the evacuation zone for.
   * @returns The evacuation zone for the given coordinates.
   */
  async findEvacuationZone(coordinates: Coordinates): Promise<EvacuationZone> {
    try {
      const params = new URLSearchParams({
        where: '1=1',
        outFields: 'incident_name,zoneId,most_extreme_status',
        f: 'geojson',
        geometry: JSON.stringify({
          x: coordinates.longitude,
          y: coordinates.latitude,
          spatialReference: { wkid: 4326 }
        }),
        geometryType: 'esriGeometryPoint',
        spatialRel: 'esriSpatialRelIntersects',
      });

      const response = await fetch(`${this.EVACUATION_ZONES_URL}?${params}`);
      const data: FeatureCollection = await response.json();

      if (!data.features?.length) {
        throw new Error('NO_EVACUATION_ZONE');
      }

      return data.features[0].properties as EvacuationZone;
    } catch (error) {
      logger.error({ error }, 'Error finding evacuation zone');
      if (error instanceof Error && error.message === 'NO_EVACUATION_ZONE') {
        throw error;
      }
      throw new Error('Error querying evacuation zones');
    }
  }

  /**
   * Find the tax parcel for a given set of coordinates.
   * This allows us to associate multiple point features in the geojson feature collection 
   * because a specific property address can have multiple damage inspections (e.g. multiple structures on the property)
   * @param coordinates - The coordinates to find the parcel for.
   * @param incidentName - The name of the incident to find the parcel for. (e.g. PALISADES, EATON)
   * @returns The parcel for the given coordinates.
   */
  async findParcel(coordinates: Coordinates, incidentName: string): Promise<Parcel> {
    try {
      const url = incidentName === 'PALISADES' ? this.PALISADES_PARCELS_URL : this.EATON_PARCELS_URL;
      const params = new URLSearchParams({
        where: '1=1',
        outFields: 'APN,Shape__Area,Shape__Length',
        f: 'geojson',
        geometry: JSON.stringify({
          x: coordinates.longitude,
          y: coordinates.latitude,
          spatialReference: { wkid: 4326 }
        }),
        geometryType: 'esriGeometryPoint',
        spatialRel: 'esriSpatialRelIntersects',
      });

      logger.debug({ 
        coordinates,
        incidentName,
        url
      }, 'Finding parcel with coordinates');

      const response = await fetch(`${url}?${params}`);
      const data: FeatureCollection = await response.json();

      logger.debug({ 
        featureCount: data.features?.length,
        firstFeature: data.features?.[0]
      }, 'Received parcel response');

      if (!data.features?.length) {
        throw new Error('NO_PARCEL');
      }

      const feature = data.features[0];
      const parcel: Parcel = {
        APN: feature.properties?.APN,
        Shape__Area: feature.properties?.Shape__Area,
        Shape__Length: feature.properties?.Shape__Length,
        geometry: feature.geometry as Polygon
      };

      logger.debug({ 
        parcel,
        geometry: feature.geometry,
        hasGeometry: !!feature.geometry,
        geometryType: feature.geometry?.type
      }, 'Found parcel');

      return parcel;
    } catch (error) {
      logger.error({ error }, 'Error finding parcel');
      if (error instanceof Error && error.message === 'NO_PARCEL') {
        throw error;
      }
      throw new Error('Error querying parcel information');
    }
  }

  /**
   * Get the attachments for a given feature.
   * @param featureUrl - The URL of the feature to get the attachments for.
   * @param objectId - The object ID of the feature to get the attachments for.
   * @returns The attachments for the given feature.
   */
  private async getAttachments(featureUrl: string, objectId: number): Promise<{ url: string; name: string; contentType: string; size: number }[]> {
    const baseUrl = featureUrl.replace('/query', '');
    const attachmentsUrl = `${baseUrl}/${objectId}/attachments`;
    
    logger.debug({ baseUrl, attachmentsUrl, objectId }, 'Fetching attachment info');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      logger.warn({ attachmentsUrl, objectId, timeout: 5000 }, 'Attachment info request timed out');
      controller.abort();
    }, 5000);

    try {
      const response = await fetch(`${attachmentsUrl}?f=json`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.attachmentInfos) {
        return [];
      }

      return data.attachmentInfos.map((attachment: any) => ({
        url: `${attachmentsUrl}/${attachment.id}`,
        name: attachment.name,
        contentType: attachment.contentType,
        size: attachment.size
      }));
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error({ attachmentsUrl, objectId, error: error.message }, 'Attachment info request timed out');
        return [];
      }
      logger.error({ error, objectId }, 'Error fetching attachments');
      return [];
    }
  }

  /**
   * Finds all the damage assessments for a given parcel.
   * @param parcel - The parcel to find the damage assessments for.
   * @param incidentName - The name of the incident to find the damage assessments for. (e.g. PALISADES, EATON)
   * @returns The damage assessments for the given parcel.
   */
  async findDamageAssessments(parcel: Feature<Polygon>, incidentName: string): Promise<DamageAssessment[]> {
    try {
      const url = incidentName === 'PALISADES' ? this.PALISADES_DAMAGE_URL : this.EATON_DAMAGE_URL;
      
      if (!parcel.geometry) {
        throw new Error('Parcel geometry is missing');
      }

      // Simplify the polygon geometry (about 1 meter precision at LA latitude)
      const simplifiedPolygon = turf.simplify(parcel, {
        tolerance: 0.00001,
        highQuality: true
      });

      // Calculate the bounding box for spatial filtering
      const bbox = turf.bbox(simplifiedPolygon);
      const spatialFilter = {
        xmin: bbox[0],
        ymin: bbox[1],
        xmax: bbox[2],
        ymax: bbox[3],
        spatialReference: { wkid: 4326 }
      };

      // Format geometry according to ArcGIS REST API requirements
      const geometry = {
        rings: [simplifiedPolygon.geometry.coordinates[0].map((coord: Position) => [coord[0], coord[1]])],
        spatialReference: { wkid: 4326 }
      };

      const params = new URLSearchParams({
        where: '1=1',
        outFields: 'OBJECTID,DAMAGE,STRUCTURETYPE',
        f: 'geojson',
        geometry: JSON.stringify(geometry),
        geometryType: 'esriGeometryPolygon',
        spatialRel: 'esriSpatialRelIntersects',
        resultRecordCount: '10',
        geometryPrecision: '5',  // Reduce coordinate precision in response
        returnGeometry: 'true',
        spatialFilter: JSON.stringify(spatialFilter)
      });

      logger.debug({ 
        geometryType: 'esriGeometryPolygon',
        geometry: geometry,
        spatialReference: geometry.spatialReference
      }, 'Querying damage assessments with geometry');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        logger.warn({ 
          url,
          timeout: 10000
        }, 'Damage assessment request timed out');
        controller.abort();
      }, 10000);

      try {
        const response = await fetch(`${url}?${params}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          if (response.status === 404) {
            logger.info('No damage assessments found (404)');
            return [];
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data: FeatureCollection = await response.json();

        logger.debug({ 
          featureCount: data.features?.length,
          responseStatus: response.status,
          firstFeature: data.features?.[0],
          geometry: geometry,
          url: url,
          params: Object.fromEntries(params.entries())
        }, 'Received damage assessment response');

        if (!data.features?.length) {
          return [];
        }

        const batchSize = 5;
        const assessments: DamageAssessment[] = [];
        
        // Process all batches in parallel
        const batches = [];
        for (let i = 0; i < data.features.length; i += batchSize) {
          const batch = data.features.slice(i, i + batchSize);
          batches.push(
            Promise.all(
              batch.map(async (feature) => {
                try {
                  const attachments = await this.getAttachments(url, feature.properties?.OBJECTID);
                  return {
                    OBJECTID: feature.properties?.OBJECTID,
                    damage_level: feature.properties?.DAMAGE,
                    structure_type: feature.properties?.STRUCTURETYPE,
                    attachments,
                  };
                } catch (error) {
                  logger.error({ error, objectId: feature.properties?.OBJECTID }, 'Error processing feature');
                  return {
                    OBJECTID: feature.properties?.OBJECTID,
                    damage_level: feature.properties?.DAMAGE,
                    structure_type: feature.properties?.STRUCTURETYPE,
                    attachments: [],
                  };
                }
              })
            )
          );
        }

        // Wait for all batches to complete
        const results = await Promise.all(batches);
        assessments.push(...results.flat());

        return assessments;
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          logger.error({ 
            url,
            error: error.message
          }, 'Damage assessment request timed out');
          throw new Error('Request timed out');
        }
        throw error;
      }
    } catch (error) {
      logger.error({ error }, 'Error finding damage assessments');
      throw new Error('Error querying damage assessments');
    }
  }
} 