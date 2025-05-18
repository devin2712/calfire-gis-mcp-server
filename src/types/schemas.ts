import { z } from 'zod';
import { Polygon } from 'geojson';

export const AddressSchema = z.union([
  z.object({
    street: z.string().optional().describe('Street address of the property location'),
    city: z.string().optional().describe('City name of where the property is located'),
    state: z.string().optional().describe('State or province where the property is located'),
    zip: z.string().optional().describe('Postal/ZIP code of the property'),
  }),
  z.string().describe('Full address as a single string')
]).describe('Represents a physical address either as a structured object or a single string');

export const CoordinatesSchema = z.object({
  latitude: z.number().describe('Latitude coordinate in decimal degrees of the location'),
  longitude: z.number().describe('Longitude coordinate in decimal degrees of the location'),
}).describe('Geographic coordinates representing a geographical point feature');

export const EvacuationZoneSchema = z.object({
  incident_name: z.string().describe('Name of the fire incident associated with the evacuation zone'),
  zoneId: z.string().describe('Unique CAL FIRE identifier for the evacuation zone'),
  most_extreme_status: z.string().describe('Most severe evacuation status in the zone (e.g., Evacuation Order, Evacuation Warning)'),
  Shape__Area: z.number().describe('Geometric area of a polygon feature in ArcGIS, measured in the coordinate system units of the dataset'),
  Shape__Length: z.number().describe('Perimeter of a polygon feature or the total length of a line feature in ArcGIS, measured in the coordinate system units of the dataset'),
}).describe('Information about an evacuation zone during a fire incident');

export const ParcelSchema = z.object({
  APN: z.string().describe('Assessor Parcel Number - unique tax identifier for the property'),
  Shape__Area: z.number().describe('Geometric area of a polygon feature in ArcGIS, measured in the coordinate system units of the dataset'),
  Shape__Length: z.number().describe('Perimeter of a polygon feature or the total length of a line feature in ArcGIS, measured in the coordinate system units of the dataset'),
  geometry: z.custom<Polygon>().describe('GeoJSON Polygon representing the parcel boundaries'),
}).describe('Property tax parcel information including boundaries and identification');

export const AttachmentSchema = z.object({
  url: z.string().describe('Public URL where the damage assessment photograph can be accessed by any system, including LLMs'),
  name: z.string().describe('Original filename of the photograph'),
  contentType: z.string().describe('MIME type of the photograph (typically image/jpeg or image/png)'),
  size: z.number().describe('Size of the photograph in bytes')
}).describe('Metadata for a publicly-accessible damage assessment photograph that can be fetched and analyzed by LLMs that represent official documentation of a specific inspection conducted by a CALFIRE inspector');

export const DamageAssessmentSchema = z.object({
  OBJECTID: z.number().describe('Unique identifier for the damage assessment record'),
  damage_level: z.string().describe('CAL FIRE damage level categories: Destroyed (>50%), Major (26-50%), Minor (10-25%), Affected (1-9%), Inaccessible, or No Damage'),
  structure_type: z.string().describe('Type of structure that was damaged (e.g. Single Family Residence Single Story, Single Family Residence Multi Story, Mobile Home Single Wide, Mobile Home Double Wide, Mobile Home Triple Wide, Commercial, Commercial Multi Story, Outbuilding, Public, Multi-Family Dwelling, Other, Unknown, Agricultural, Recreational, Religious, Industrial, Government, Education, Healthcare, Utility, Transportation)'),
  attachments: z.array(AttachmentSchema).describe('Photographs documenting the damage to the structure'),
}).describe('Assessment of damage to a structure or property, including photographic evidence');

export const CachedAssessmentSchema = z.object({
  coordinates: CoordinatesSchema.describe('Geographic coordinates of the assessment location'),
  evacuationZone: EvacuationZoneSchema.describe('Associated evacuation zone information'),
  parcel: ParcelSchema.describe('Property parcel information. If this field is missing, it indicates the property was not within the bounds of reported fire data'),
  damageAssessments: z.array(DamageAssessmentSchema).describe('List of damage assessments (photographs and destruction levels) for the property parcel. An empty array indicates that no damage was reported for this property'),
  address: z.string().describe('The normalized address string returned by the geocoding service'),
}).describe('Fire assessment report including property location, evacuation zone, and damage information');

export type Address = z.infer<typeof AddressSchema>;
export type Coordinates = z.infer<typeof CoordinatesSchema>;
export type EvacuationZone = z.infer<typeof EvacuationZoneSchema>;
export type Parcel = z.infer<typeof ParcelSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;
export type DamageAssessment = z.infer<typeof DamageAssessmentSchema>;
export type CachedAssessment = z.infer<typeof CachedAssessmentSchema>; 