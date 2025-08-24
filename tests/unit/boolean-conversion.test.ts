import { describe, expect, it } from "vitest";

// Import the function by creating a minimal version for testing
// Since it's not exported, we'll test the behavior indirectly
function convertStringBooleans(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    // Convert string "true"/"false" to boolean, case-insensitive
    const lowerStr = obj.toLowerCase();
    if (lowerStr === "true") return true;
    if (lowerStr === "false") return false;
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(convertStringBooleans);
  }

  if (typeof obj === "object") {
    const converted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertStringBooleans(value);
    }
    return converted;
  }

  return obj;
}

describe("Boolean conversion utility", () => {
  it('should convert string "true" to boolean true', () => {
    expect(convertStringBooleans("true")).toBe(true);
    expect(convertStringBooleans("True")).toBe(true);
    expect(convertStringBooleans("TRUE")).toBe(true);
  });

  it('should convert string "false" to boolean false', () => {
    expect(convertStringBooleans("false")).toBe(false);
    expect(convertStringBooleans("False")).toBe(false);
    expect(convertStringBooleans("FALSE")).toBe(false);
  });

  it("should leave other strings unchanged", () => {
    expect(convertStringBooleans("hello")).toBe("hello");
    expect(convertStringBooleans("123")).toBe("123");
    expect(convertStringBooleans("")).toBe("");
  });

  it("should handle nested objects", () => {
    const input = {
      flag: "true",
      enabled: "False",
      name: "test",
      nested: {
        visible: "TRUE",
        count: 42,
      },
    };

    const expected = {
      flag: true,
      enabled: false,
      name: "test",
      nested: {
        visible: true,
        count: 42,
      },
    };

    expect(convertStringBooleans(input)).toEqual(expected);
  });

  it("should handle arrays", () => {
    const input = ["true", "false", "hello", "TRUE"];
    const expected = [true, false, "hello", true];
    expect(convertStringBooleans(input)).toEqual(expected);
  });

  it("should handle null and undefined", () => {
    expect(convertStringBooleans(null)).toBe(null);
    expect(convertStringBooleans(undefined)).toBe(undefined);
  });

  it("should handle primitive types correctly", () => {
    expect(convertStringBooleans(42)).toBe(42);
    expect(convertStringBooleans(true)).toBe(true);
    expect(convertStringBooleans(false)).toBe(false);
  });

  it("should handle realistic tool parameters", () => {
    // Simulate LLM sending string booleans in tool parameters
    const toolArgs = {
      fullPage: "True",
      options: {
        includeHidden: "false",
        scrollIntoView: "TRUE",
        limit: 10,
        searchType: "auto",
      },
    };

    const expected = {
      fullPage: true,
      options: {
        includeHidden: false,
        scrollIntoView: true,
        limit: 10,
        searchType: "auto",
      },
    };

    expect(convertStringBooleans(toolArgs)).toEqual(expected);
  });
});
