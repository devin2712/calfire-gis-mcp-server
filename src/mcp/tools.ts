import { z } from 'zod';
import { ArcGISService } from '../services/arcgis.service.js';
import { AddressSchema } from '../types/schemas.js';
import { logger } from '../utils/logger.js';

const arcgisService = new ArcGISService();

interface ToolContext {
  progressToken?: string;
  sendProgress?: (params: { progressToken: string; progress: number; total: number; message?: string }) => Promise<void>;
}

async function sendProgressNotification(context: ToolContext | undefined, progress: number, total: number = 100, message?: string) {
  if (context?.progressToken && context?.sendProgress) {
    try {
      await context.sendProgress({
        progressToken: context.progressToken,
        progress,
        total,
        message
      });
    } catch (error) {
      logger.warn({ error, progress }, 'Failed to send progress notification');
    }
  }
}

export const tools = [
  {
    name: 'fetch_fire_damage_assessment_for_address',
    description: "Fetches the CAL FIRE DINS fire damage assessment for a given address in the Los Angeles region for the January 2025 Palisades or Eaton fires. \
    Given an address, the tool will return the following information: \
    1) the evacuation zone, \
    2) the parcel APN number, \
    3) the damage assessments and any related publicly-accessible photographs as attachments, \
    4) the coordinates of the address.",
    parameters: z.object({
      address: AddressSchema,
    }),
    handler: async ({ address }: { address: z.infer<typeof AddressSchema> }, context?: ToolContext) => {
      try {
        logger.info({ address }, 'Starting fire damage assessment');

        // Initial progress notification
        await sendProgressNotification(context, 0, 100, 'Starting fire damage assessment...');

        // Step 1: Geocode address (25% progress)
        const { coordinates, address: normalizedAddress } = await arcgisService.geocodeAddress(address);
        await sendProgressNotification(context, 25, 100, 'Address geocoding completed...');

        // Check cache for existing assessment
        const cacheKey = arcgisService.generateCacheKey(coordinates);
        const cachedAssessment = arcgisService.getCachedAssessment(cacheKey);
        if (cachedAssessment) {
          logger.debug({ cacheKey }, 'Cache hit - returning cached assessment');
          logger.info({ address }, 'Returning fire damage assessment');
          await sendProgressNotification(context, 100, 100, 'Returning fire damage assessment...');
          return cachedAssessment;
        }

        // Step 2: Find evacuation zone (50% progress)
        const evacuationZone = await arcgisService.findEvacuationZone(coordinates);
        await sendProgressNotification(context, 50, 100, 'Evacuation zone identified...');

        // Step 3: Find parcel (75% progress)
        const parcel = await arcgisService.findParcel(coordinates, evacuationZone.incident_name);
        await sendProgressNotification(context, 75, 100, 'Parcel information retrieved...');

        // Step 4: Find damage assessments (100% progress)
        const damageAssessments = await arcgisService.findDamageAssessments(
          {
            type: 'Feature',
            geometry: parcel.geometry,
            properties: parcel,
          },
          evacuationZone.incident_name
        );

        // Create and cache the complete assessment
        const assessment = {
          coordinates,
          evacuationZone,
          parcel,
          damageAssessments,
          address: normalizedAddress
        };

        // Cache the assessment
        arcgisService.cacheAssessment(cacheKey, assessment);
        logger.debug({ cacheKey, address }, 'Cached new assessment');

        logger.info({ address }, 'Returning fire damage assessment');
        await sendProgressNotification(context, 100, 100, 'Assessment complete...');
        return assessment;
      } catch (error) {
        logger.error({ error }, 'Error in fire damage assessment');
        throw error;
      }
    },
  }
]; 