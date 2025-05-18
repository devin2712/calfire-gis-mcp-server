import { beforeAll, describe, expect, test } from "bun:test";
import { Feature, Polygon } from 'geojson';
import { ArcGISService } from '../src/services/arcgis.service';
import { Address } from '../src/types/schemas';

describe('ArcGIS Service Integration Tests', () => {
  let service: ArcGISService;

  beforeAll(() => {
    service = new ArcGISService();
  });

  // Test data for both fires
  //
  // No damage: CAL FIRE DINS assessment was made and indicates no damage
  // Has damage: CAL FIRE DINS assessment was made and indicates damage
  // No assessments: CAL FIRE DINS assessment was not made
  const testCases = {
    eaton: {
      // Altadena Community Center
      noDamage: {
        street: '730 E Altadena Dr',
        city: 'Altadena',
        state: 'CA',
        zip: '91001'
      },
      // United States Postal Service
      hasDamage: {
        street: '2271 Lake Ave',
        city: 'Altadena',
        state: 'CA',
        zip: '91001'
      },
      // St. Elizabeth of Hungary Catholic Church
      noAssessments: {
        street: '1879 N Lake Ave',
        city: 'Altadena',
        state: 'CA',
        zip: '91001'
      }
    },
    palisades: {
      // United States Postal Service
      noDamage: {
        street: '15243 La Cruz Dr',
        city: 'Pacific Palisades',
        state: 'CA',
        zip: '90272'
      },
      // Palisades Village Center
      hasDamage: {
        street: '881 Alma Real Dr',
        city: 'Pacific Palisades',
        state: 'CA',
        zip: '90272'
      },
      // Riviera Country Club
      noAssessments: {
        street: '1250 Capri Dr',
        city: 'Pacific Palisades',
        state: 'CA',
        zip: '90272'
      }
    }
  };

  // Helper function to verify coordinates are within LA County bounds
  const verifyCoordinates = (coordinates: { latitude: number; longitude: number }) => {
    expect(coordinates.latitude).toBeGreaterThan(33.7); // Southern boundary of LA County
    expect(coordinates.latitude).toBeLessThan(34.9); // Northern boundary of LA County
    expect(coordinates.longitude).toBeGreaterThan(-118.9); // Western boundary of LA County
    expect(coordinates.longitude).toBeLessThan(-117.6); // Eastern boundary of LA County
  };

  // Helper function to verify address
  const verifyAddress = (address: string) => {
    expect(typeof address).toBe('string');
    expect(address.length).toBeGreaterThan(0);
  };

  // Helper function to verify evacuation zone
  const verifyEvacuationZone = (evacuationZone: any, expectedIncident: string) => {
    expect(evacuationZone).toBeDefined();
    expect(evacuationZone.incident_name).toBeDefined();
    expect(evacuationZone.incident_name).toBe(expectedIncident);
  };

  // Helper function to verify parcel
  const verifyParcel = (parcel: any) => {
    expect(parcel).toBeDefined();
    expect(parcel.APN).toBeDefined();
    expect(parcel.Shape__Area).toBeGreaterThan(0);
    expect(parcel.Shape__Length).toBeGreaterThan(0);
    expect(parcel.geometry).toBeDefined();
    expect(parcel.geometry.type).toBe('Polygon');
    expect(parcel.geometry.coordinates).toBeDefined();
  };

  // Helper function to verify damage assessments
  const verifyDamageAssessments = (assessments: any[], expectedHasDamage: boolean) => {
    expect(Array.isArray(assessments)).toBe(true);
    if (expectedHasDamage) {
      expect(assessments.length).toBeGreaterThan(0);
      const assessment = assessments[0];
      expect(assessment.OBJECTID).toBeDefined();
      expect(assessment.damage_level).toBeDefined();
      expect(assessment.structure_type).toBeDefined();
      expect(Array.isArray(assessment.attachments)).toBe(true);
    } else {
      expect(assessments.length).toBe(0);
    }
  };

  // Helper function to run a complete test case
  const runTestCase = async (address: Address, expectedIncident: string, expectedHasDamage: boolean) => {
    const { coordinates, address: normalizedAddress } = await service.geocodeAddress(address);
    verifyCoordinates(coordinates);
    verifyAddress(normalizedAddress);

    const evacuationZone = await service.findEvacuationZone(coordinates);
    verifyEvacuationZone(evacuationZone, expectedIncident);

    const parcel = await service.findParcel(coordinates, evacuationZone.incident_name);
    verifyParcel(parcel);

    const parcelFeature: Feature<Polygon> = {
      type: 'Feature',
      geometry: parcel.geometry,
      properties: parcel,
    };
    const damageAssessments = await service.findDamageAssessments(parcelFeature, evacuationZone.incident_name);
    verifyDamageAssessments(damageAssessments, expectedHasDamage);
  };

  // Test Eaton Fire cases
  describe('Eaton Fire Tests', () => {
    test('should handle address with no damage', async () => {
      await runTestCase(testCases.eaton.noDamage, 'EATON', true);
    }, 10000);

    test('should handle address with damage', async () => {
      await runTestCase(testCases.eaton.hasDamage, 'EATON', true);
    }, 10000);

    test('should handle address with no assessments', async () => {
      await runTestCase(testCases.eaton.noAssessments, 'EATON', false);
    }, 10000);
  });

  // Test Palisades Fire cases
  describe('Palisades Fire Tests', () => {
    test('should handle address with no damage', async () => {
      await runTestCase(testCases.palisades.noDamage, 'PALISADES', true);
    }, 10000);

    test('should handle address with damage', async () => {
      await runTestCase(testCases.palisades.hasDamage, 'PALISADES', true);
    }, 10000);

    test('should handle address with no assessments', async () => {
      await runTestCase(testCases.palisades.noAssessments, 'PALISADES', false);
    }, 10000);
  });
}); 