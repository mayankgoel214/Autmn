import { signupSchema, loginSchema } from '@/lib/validators/auth'

describe('signupSchema', () => {
  it('accepts valid signup data', () => {
    const result = signupSchema.safeParse({
      name: 'Mayank Goel',
      email: 'mayank@acmetech.in',
      password: 'Test1234',
    })
    expect(result.success).toBe(true)
  })

  it('rejects name shorter than 2 characters', () => {
    const result = signupSchema.safeParse({
      name: 'M',
      email: 'mayank@acmetech.in',
      password: 'Test1234',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('2 characters')
    }
  })

  it('rejects invalid email', () => {
    const result = signupSchema.safeParse({
      name: 'Mayank Goel',
      email: 'not-an-email',
      password: 'Test1234',
    })
    expect(result.success).toBe(false)
  })

  it('rejects password shorter than 8 characters', () => {
    const result = signupSchema.safeParse({
      name: 'Mayank Goel',
      email: 'mayank@acmetech.in',
      password: 'Test1',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('8 characters')
    }
  })

  it('rejects password without uppercase letter', () => {
    const result = signupSchema.safeParse({
      name: 'Mayank Goel',
      email: 'mayank@acmetech.in',
      password: 'test1234',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('uppercase')
    }
  })

  it('rejects password without number', () => {
    const result = signupSchema.safeParse({
      name: 'Mayank Goel',
      email: 'mayank@acmetech.in',
      password: 'Testtest',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('number')
    }
  })

  it('rejects empty fields', () => {
    const result = signupSchema.safeParse({
      name: '',
      email: '',
      password: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('loginSchema', () => {
  it('accepts valid login data', () => {
    const result = loginSchema.safeParse({
      email: 'mayank@acmetech.in',
      password: 'Test1234',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'bad-email',
      password: 'Test1234',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({
      email: 'mayank@acmetech.in',
      password: '',
    })
    expect(result.success).toBe(false)
  })
})
